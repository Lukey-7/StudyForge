"""Layer 4 - Reciprocal Rank Fusion (RRF).

Dense scores (cosine, 0..1) and BM25 scores (0..unbounded) are on different
scales, so we can't just add them. RRF ignores the scores and uses only the
RANK of each chunk in each list:

    score(chunk) = sum over lists of  1 / (k + rank)      (rank starts at 1, k = 60)

A chunk ranked highly by BOTH retrievers wins. k=60 (from the original RRF
paper) dampens the difference between rank 1 and rank 2 so one list can't dominate.
"""


def reciprocal_rank_fusion(ranked_lists: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda item: item[1], reverse=True)
