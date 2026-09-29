"""The multi-layer retrieval pipeline, wired together.

    query
      │  (1) scope filter ── notebook / sources / pages
      ├─(2) dense: embed query -> Chroma top-20 (cosine)
      ├─(3) keyword: BM25 top-20
      │  (4) Reciprocal Rank Fusion of the two ranked lists
      │  (5) MMR diversify (+ optional LLM rerank) -> top-8
      ▼  (6) context assembly: token budget, [S#] labels, citation map

`mode` lets the eval script switch layers on/off to measure what each adds:
    dense | bm25 | hybrid (dense+bm25+RRF) | hybrid_mmr (+ MMR) | hybrid_mmr_rerank (+ LLM rerank)
Chat and pipelines use hybrid_mmr (+ LLM rerank when RERANK_WITH_LLM=true).
"""

import logging
from dataclasses import dataclass, field
from typing import Literal

from app.db.repository import Row
from app.retrieval.context import AssembledContext, assemble_context
from app.retrieval.dense import dense_search
from app.retrieval.fusion import reciprocal_rank_fusion
from app.retrieval.keyword import keyword_search
from app.retrieval.rerank import llm_rerank, mmr
from app.retrieval.scope import Scope
from app.services import Services

logger = logging.getLogger(__name__)

Mode = Literal["dense", "bm25", "hybrid", "hybrid_mmr", "hybrid_mmr_rerank"]
MODES: tuple[Mode, ...] = ("dense", "bm25", "hybrid", "hybrid_mmr", "hybrid_mmr_rerank")
FUSION_POOL = 30  # how many fused candidates MMR / rerank may choose from


@dataclass
class RetrievalResult:
    chunk_ids: list[str]
    chunks: list[Row]
    context: AssembledContext
    embedding_model: str
    debug: dict = field(default_factory=dict)


class Retriever:
    def __init__(self, services: Services) -> None:
        self.s = services
        self.cfg = services.settings

    def rank(
        self, query: str, scope: Scope, sources_version: int, mode: Mode = "hybrid_mmr", final_k: int | None = None
    ) -> tuple[list[str], dict, str]:
        """Layers 1-5. Returns (ranked chunk ids, debug info, embedding model used)."""
        _, embedder = self.s.require_ai()
        final_k = final_k or self.cfg.final_k
        debug: dict = {"mode": mode}

        query_embedding: list[float] = []
        model = embedder.active_model
        dense: list[tuple[str, float]] = []
        if mode != "bm25":
            query_embedding = embedder.embed_query(query)
            model = embedder.active_model
            dense = dense_search(query_embedding, model, self.s.vectors, scope, k=self.cfg.dense_k)
            debug["dense"] = [{"id": i, "score": round(s, 4)} for i, s in dense]

        keyword: list[tuple[str, float]] = []
        if mode != "dense":
            index = self.s.bm25.get(scope.notebook_id, sources_version, lambda: self.s.repo.list_chunks(scope.notebook_id))
            keyword = keyword_search(index, query, scope, k=self.cfg.keyword_k)
            debug["bm25"] = [{"id": i, "score": round(s, 4)} for i, s in keyword]

        if mode == "dense":
            scored = dense
        elif mode == "bm25":
            scored = keyword
        else:
            fused = reciprocal_rank_fusion([[i for i, _ in dense], [i for i, _ in keyword]], k=self.cfg.rrf_k)
            scored = fused[:FUSION_POOL]
            debug["fused"] = [{"id": i, "score": round(s, 5)} for i, s in scored]
        ranked = [i for i, _ in scored]

        if mode in ("hybrid_mmr", "hybrid_mmr_rerank") and ranked:
            embeddings = self.s.vectors.get_embeddings(model, ranked)
            ranked = mmr(scored, embeddings, top_n=max(final_k, 10), lambda_=self.cfg.mmr_lambda)
            use_llm_rerank = mode == "hybrid_mmr_rerank" or self.cfg.rerank_with_llm
            if use_llm_rerank and self.s.llm is not None:
                candidates = self.s.repo.get_chunks(ranked[:10])
                ranked = llm_rerank(self.s.llm, query, candidates, top_n=final_k)
            debug["mmr"] = ranked[:final_k]

        return ranked[:final_k], debug, model

    def retrieve(
        self,
        query: str,
        scope: Scope,
        sources_version: int,
        mode: Mode = "hybrid_mmr",
        final_k: int | None = None,
        token_budget: int | None = None,
    ) -> RetrievalResult:
        """All six layers: ranked ids -> chunk rows -> labelled context."""
        ranked, debug, model = self.rank(query, scope, sources_version, mode, final_k)
        rows_by_id = {r["id"]: r for r in self.s.repo.get_chunks(ranked)}
        chunks = [rows_by_id[i] for i in ranked if i in rows_by_id]
        names = {s["id"]: s["file_name"] for s in self.s.repo.list_sources(scope.notebook_id)}
        context = assemble_context(chunks, names, token_budget or self.cfg.context_token_budget)
        return RetrievalResult(ranked, chunks, context, model, debug)
