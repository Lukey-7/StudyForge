"""Retrieval evaluation: Recall@5 and MRR@10 for each retrieval configuration.

    cd backend
    python -m eval.run_eval            # real Gemini embeddings (needs GEMINI_API_KEY in backend/.env)
    python -m eval.run_eval --fake     # hashed bag-of-words embeddings, only to test the script
    python -m eval.run_eval --chunk-tokens 600   # evaluate at the production chunk size

Why 200-token chunks by default: the 3 eval documents are short. At the production
size (600) they make only ~12 chunks, so ANY method puts the answer in the top 5 and
the benchmark can't tell methods apart. Smaller chunks give ~50 candidates, which
makes the comparison meaningful. The chunk size used is printed with the results.

What it does:
  1. Builds a throw-away notebook (in-memory DB + temporary Chroma folder).
  2. Ingests the 3 committed documents with the REAL ingestion pipeline (extract -> chunk -> embed).
  3. For every question and every mode (dense, bm25, hybrid, hybrid_mmr, hybrid_mmr_rerank) asks the retriever for
     the top 10 chunks and finds the rank of the first RELEVANT chunk (one containing the answer phrase).
  4. Recall@1 / Recall@5 = share of questions with a relevant chunk at rank 1 / in the top 5.
     MRR@10  = mean of 1/rank of the first relevant chunk (0 if none in the top 10).

Results are printed as a markdown table and saved to eval/results.md + eval/results.json.
"""

import argparse
import json
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

from app.config import get_settings
from app.db.local_repo import LocalFileStorage, LocalRepository
from app.ingest.pipeline import create_source, run_ingestion
from app.retrieval.retriever import MODES, Retriever
from app.retrieval.scope import Scope
from app.services import Services
from app.vector_store import ChromaVectorStore

EVAL_DIR = Path(__file__).resolve().parent
TOP_K = 10


def normalise(text: str) -> str:
    return " ".join(text.split()).lower()


class CachingEmbedder:
    """Embed each distinct query once, even though 3 modes ask for it (saves free-tier quota)."""

    def __init__(self, inner) -> None:
        self.inner = inner
        self._cache: dict[str, list[float]] = {}

    @property
    def active_model(self) -> str:
        return self.inner.active_model

    def embed_documents(self, texts):
        return self.inner.embed_documents(texts)

    def embed_query(self, text):
        if text not in self._cache:
            self._cache[text] = self.inner.embed_query(text)
        return self._cache[text]


def build_services(fake: bool, workdir: Path, chunk_tokens: int) -> Services:
    settings = get_settings().model_copy(
        update={
            "chroma_mode": "embedded",
            "chroma_path": str(workdir / "chroma"),
            "rerank_with_llm": False,
            "chunk_target_tokens": chunk_tokens,
            "chunk_max_tokens": int(chunk_tokens * 4 / 3),
        }
    )
    if fake:
        sys.path.insert(0, str(EVAL_DIR.parent))
        from tests.fakes import DIM, FakeEmbedder, FakeLLM

        settings = settings.model_copy(update={"embedding_dim": DIM})
        llm, embedder = FakeLLM(), FakeEmbedder()
    else:
        if not settings.gemini_api_key:
            raise SystemExit("GEMINI_API_KEY is not set (backend/.env). Use --fake to test the script only.")
        from app.llm.gemini import GeminiClient

        llm = embedder = GeminiClient(settings)
    return Services(
        settings=settings,
        repo=LocalRepository(),
        storage=LocalFileStorage(str(workdir / "uploads")),
        llm=llm,
        embedder=CachingEmbedder(embedder),
        vectors=ChromaVectorStore(settings),
    )


def ingest_documents(services: Services, doc_paths: list[str]) -> dict:
    notebook = services.repo.create_notebook("eval-user", "Eval notebook", None)
    for rel in doc_paths:
        path = EVAL_DIR / rel
        source, _ = create_source(services, "eval-user", notebook["id"], path.name, path.read_bytes(), "text/markdown")
        run_ingestion(services, source["id"])
        source = services.repo.get_source(source["id"])
        if source["status"] != "ready":
            raise SystemExit(f"ingestion failed for {path.name}: {source['error_message']}")
        print(f"  ingested {path.name}: {source['chunk_count']} chunks")
    return services.repo.get_notebook("eval-user", notebook["id"])


def first_relevant_rank(ranked_ids: list[str], chunk_text: dict[str, str], phrases: list[str]) -> int | None:
    wanted = [normalise(p) for p in phrases]
    for rank, chunk_id in enumerate(ranked_ids, start=1):
        text = chunk_text.get(chunk_id, "")
        if any(p in text for p in wanted):
            return rank
    return None


def evaluate(services: Services, notebook: dict, questions: list[dict], modes: list[str]) -> dict:
    retriever = Retriever(services)
    chunk_text = {c["id"]: normalise(c["text"]) for c in services.repo.list_chunks(notebook["id"])}
    scope = Scope(notebook["id"])
    results: dict = {}
    for mode in modes:
        per_question = []
        for q in questions:
            ranked, _, _ = retriever.rank(q["question"], scope, notebook["sources_version"], mode=mode, final_k=TOP_K)
            rank = first_relevant_rank(ranked, chunk_text, q["answer_contains"])
            per_question.append({"id": q["id"], "kind": q["kind"], "rank": rank})
        results[mode] = per_question
    return results


def summarise(per_question: list[dict]) -> dict:
    n = len(per_question) or 1
    recall1 = sum(1 for r in per_question if r["rank"] == 1) / n
    recall5 = sum(1 for r in per_question if r["rank"] and r["rank"] <= 5) / n
    mrr = sum(1 / r["rank"] for r in per_question if r["rank"]) / n
    return {"recall@1": round(recall1, 3), "recall@5": round(recall5, 3), "mrr@10": round(mrr, 3), "n": len(per_question)}


def markdown_table(results: dict) -> str:
    lines = [
        "| Retrieval mode | Recall@1 | Recall@5 | MRR@10 | MRR (keyword Qs) | MRR (paraphrase Qs) |",
        "|---|---|---|---|---|---|",
    ]
    labels = {
        "dense": "Dense only (Chroma)",
        "bm25": "BM25 only",
        "hybrid": "Hybrid (RRF)",
        "hybrid_mmr": "Hybrid (RRF) + MMR",
        "hybrid_mmr_rerank": "Hybrid + MMR + LLM rerank",
    }
    for mode, rows in results.items():
        overall = summarise(rows)
        keyword = summarise([r for r in rows if r["kind"] == "keyword"])
        paraphrase = summarise([r for r in rows if r["kind"] == "paraphrase"])
        lines.append(
            f"| {labels[mode]} | {overall['recall@1']:.2f} | {overall['recall@5']:.2f} | {overall['mrr@10']:.2f} "
            f"| {keyword['mrr@10']:.2f} | {paraphrase['mrr@10']:.2f} |"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fake", action="store_true", help="use fake embeddings (tests the script; numbers are meaningless)")
    parser.add_argument("--skip-rerank", action="store_true", help="skip the LLM-rerank mode (saves ~33 LLM calls)")
    parser.add_argument("--chunk-tokens", type=int, default=200, help="chunk target size for the eval (default 200)")
    args = parser.parse_args()

    spec = json.loads((EVAL_DIR / "eval_set.json").read_text(encoding="utf-8"))
    started = time.perf_counter()
    # ignore_cleanup_errors: on Windows Chroma may still hold its files open at exit.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        services = build_services(args.fake, Path(tmp), args.chunk_tokens)
        print("Ingesting evaluation documents...")
        notebook = ingest_documents(services, spec["documents"])
        modes = [m for m in MODES if not (args.skip_rerank and m == "hybrid_mmr_rerank")]
        results = evaluate(services, notebook, spec["questions"], modes)
        model = services.embedder.active_model
        chunk_count = len(services.repo.list_chunks(notebook["id"]))
        cfg = services.settings

    table = markdown_table(results)
    header = (
        f"Embedding model: `{model}` | rerank LLM: `{cfg.llm_model}`{' (FAKE - not a real result)' if args.fake else ''} | "
        f"{len(spec['questions'])} questions over {len(spec['documents'])} documents ({chunk_count} chunks) | "
        f"chunk target {cfg.chunk_target_tokens} tokens, {int(cfg.chunk_overlap_ratio * 100)}% overlap | "
        f"k_dense={cfg.dense_k}, k_bm25={cfg.keyword_k}, RRF k={cfg.rrf_k}, MMR lambda={cfg.mmr_lambda} | "
        f"run {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}"
    )
    print("\n" + header + "\n\n" + table + f"\n\n(took {time.perf_counter() - started:.0f}s)")

    if not args.fake:
        suffix = "" if args.chunk_tokens == 200 else f"_{args.chunk_tokens}"
        (EVAL_DIR / f"results{suffix}.md").write_text(f"# Retrieval evaluation\n\n{header}\n\n{table}\n", encoding="utf-8")
        summary = {mode: summarise(rows) for mode, rows in results.items()}
        (EVAL_DIR / f"results{suffix}.json").write_text(
            json.dumps({"embedding_model": model, "summary": summary, "per_question": results}, indent=2), encoding="utf-8"
        )
        print(f"Saved eval/results{suffix}.md and eval/results{suffix}.json")


if __name__ == "__main__":
    main()
