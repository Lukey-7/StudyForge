"""Layer 5 - rerank / diversify.

Maximal Marginal Relevance (MMR): pick chunks one at a time, each time choosing
the chunk that is most relevant to the query BUT least similar to what we've
already picked:

    MMR(d) = lambda * relevance(d)  -  (1 - lambda) * max_{s in selected} cosine(d, s)

lambda = 1.0 -> pure relevance; lambda = 0.0 -> pure diversity. We use 0.7.

relevance(d) is the chunk's HYBRID (RRF) score, min-max scaled to 0..1, not just
its cosine similarity to the query. Otherwise MMR would silently throw away what
BM25 contributed and re-rank by embeddings alone (the eval script caught this).
Why: overlapping chunks (we use 15% overlap!) and repeated slides often carry
the same fact; MMR stops them from filling the whole context window.

Optional LLM rerank (RERANK_WITH_LLM=true): ask Gemini to order the top
candidates by usefulness. More accurate, but costs one extra LLM call.
"""

import logging

from pydantic import BaseModel

from app.llm.base import LLM

logger = logging.getLogger(__name__)


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def min_max_scale(scores: list[tuple[str, float]]) -> dict[str, float]:
    """Map scores to 0..1 so they are comparable with cosine similarities."""
    if not scores:
        return {}
    values = [v for _, v in scores]
    low, high = min(values), max(values)
    return {k: (v - low) / (high - low) if high > low else 1.0 for k, v in scores}


def mmr(
    ranked: list[tuple[str, float]],
    embeddings: dict[str, list[float]],
    top_n: int,
    lambda_: float = 0.7,
) -> list[str]:
    """`ranked` = [(chunk_id, relevance score)] best first (e.g. RRF output).
    Returns up to top_n ids re-ordered for relevance + diversity.
    Candidates without an embedding keep their original order at the end."""
    relevance = min_max_scale(ranked)
    candidates = [c for c, _ in ranked]
    pool = [c for c in candidates if c in embeddings]
    selected: list[str] = []
    while pool and len(selected) < top_n:

        def mmr_score(c: str) -> float:
            redundancy = max((cosine(embeddings[c], embeddings[s]) for s in selected), default=0.0)
            return lambda_ * relevance[c] - (1 - lambda_) * redundancy

        best = max(pool, key=mmr_score)
        selected.append(best)
        pool.remove(best)
    leftovers = [c for c in candidates if c not in embeddings and c not in selected]
    return (selected + leftovers)[:top_n]


class RerankOrder(BaseModel):
    ranked_ids: list[str]


def llm_rerank(llm: LLM, query: str, chunks: list[dict], top_n: int) -> list[str]:
    """Ask the LLM to order candidate chunks by usefulness for answering the query."""
    listing = "\n\n".join(f"[id={c['id']}]\n{c['text'][:700]}" for c in chunks)
    prompt = (
        f"Question: {query}\n\nCandidate passages:\n{listing}\n\n"
        f"Return the ids of the {top_n} passages most useful for answering the question, "
        "most useful first. Use only ids from the list."
    )
    try:
        order = llm.generate_json(prompt, RerankOrder, fast=True).data.ranked_ids
    except Exception as exc:  # noqa: BLE001 - reranking is optional; never fail the request
        logger.warning("LLM rerank failed, keeping MMR order: %s", exc)
        return [c["id"] for c in chunks][:top_n]
    known = {c["id"] for c in chunks}
    ranked = [i for i in order if i in known]
    ranked += [c["id"] for c in chunks if c["id"] not in ranked]
    return ranked[:top_n]
