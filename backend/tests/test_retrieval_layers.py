import pytest

from app.retrieval.context import assemble_context
from app.retrieval.fusion import reciprocal_rank_fusion
from app.retrieval.keyword import BM25Cache, build_index, keyword_search
from app.retrieval.rerank import cosine, mmr
from app.retrieval.scope import Scope

# ------------------------------------------------------------------ RRF


def test_rrf_exact_scores():
    fused = dict(reciprocal_rank_fusion([["a", "b"], ["b", "c"]], k=60))
    assert fused["a"] == pytest.approx(1 / 61)
    assert fused["b"] == pytest.approx(1 / 62 + 1 / 61)
    assert fused["c"] == pytest.approx(1 / 62)


def test_rrf_rewards_agreement_between_lists():
    fused = reciprocal_rank_fusion([["x", "shared", "y"], ["z", "shared", "w"]])
    assert fused[0][0] == "shared"


def test_rrf_handles_empty_lists():
    assert reciprocal_rank_fusion([[], []]) == []
    assert [i for i, _ in reciprocal_rank_fusion([["a"], []])] == ["a"]


# ------------------------------------------------------------------ MMR


def test_mmr_skips_near_duplicates():
    embeddings = {
        "best": [0.99, 0.1, 0.0],
        "duplicate_of_best": [0.99, 0.11, 0.0],
        "different_but_relevant": [0.7, 0.0, 0.7],
    }
    embeddings["unrelated"] = [0.0, 1.0, 0.0]
    ranked = [("best", 0.030), ("duplicate_of_best", 0.029), ("different_but_relevant", 0.0285), ("unrelated", 0.010)]
    assert mmr(ranked, embeddings, top_n=2, lambda_=0.5) == ["best", "different_but_relevant"]


def test_mmr_with_lambda_one_keeps_the_fused_order():
    embeddings = {"a": [0.9, 0.1], "b": [0.95, 0.05], "c": [0.1, 0.9]}
    ranked = [("c", 0.9), ("a", 0.5), ("b", 0.1)]  # order comes from RRF, not from the embeddings
    assert mmr(ranked, embeddings, top_n=3, lambda_=1.0) == ["c", "a", "b"]


def test_mmr_keeps_candidates_without_embeddings_at_the_end():
    assert mmr([("a", 1.0), ("missing", 0.9)], {"a": [1.0, 0.0]}, top_n=2) == ["a", "missing"]


def test_cosine():
    assert cosine([1, 0], [1, 0]) == pytest.approx(1.0)
    assert cosine([1, 0], [0, 1]) == pytest.approx(0.0)
    assert cosine([0, 0], [1, 1]) == 0.0


# ------------------------------------------------------------------ BM25


def chunk(i: str, text: str, source: str = "s1", page: int = 1) -> dict:
    return {"id": i, "text": text, "source_id": source, "page": page, "heading": None}


def test_bm25_finds_exact_rare_terms():
    chunks = [
        chunk("c1", "Normalization removes redundancy in relational tables."),
        chunk("c2", "A B-tree index keeps keys sorted for logarithmic lookups."),
        chunk("c3", "Transactions follow ACID properties: atomicity and durability."),
    ]
    hits = keyword_search(build_index(1, chunks), "what is ACID atomicity", Scope("nb"))
    assert hits[0][0] == "c3"


def test_bm25_respects_scope():
    chunks = [chunk("c1", "indexing indexing", source="s1"), chunk("c2", "indexing", source="s2")]
    hits = keyword_search(build_index(1, chunks), "indexing", Scope("nb", source_ids=("s2",)))
    assert [h[0] for h in hits] == ["c2"]


def test_bm25_cache_rebuilds_when_version_changes():
    cache = BM25Cache()
    loads = []

    def loader():
        loads.append(1)
        return [chunk("c1", "hello world")]

    cache.get("nb", 1, loader)
    cache.get("nb", 1, loader)
    assert len(loads) == 1  # cached
    cache.get("nb", 2, loader)
    assert len(loads) == 2  # sources changed -> rebuilt
    cache.invalidate("nb")
    cache.get("nb", 2, loader)
    assert len(loads) == 3


# ------------------------------------------------------------------ scope


def test_scope_to_chroma_where():
    assert Scope("nb").to_chroma_where() == {"notebook_id": "nb"}
    where = Scope("nb", ("s1",), page_from=2, page_to=5).to_chroma_where()
    assert where == {
        "$and": [
            {"notebook_id": "nb"},
            {"source_id": {"$in": ["s1"]}},
            {"page": {"$gte": 2}},
            {"page": {"$lte": 5}},
        ]
    }
    assert Scope("nb", page_from=2).allows("any", 3)
    assert not Scope("nb", page_from=2).allows("any", 1)


# ------------------------------------------------------------------ context


def ctx_chunk(i, source, page, index, tokens=100):
    return {
        "id": i,
        "source_id": source,
        "page": page,
        "chunk_index": index,
        "heading": None,
        "text": f"text {i}",
        "token_count": tokens,
    }


def test_context_respects_budget_and_orders_by_source_then_page():
    chunks = [
        ctx_chunk("c1", "sB", 9, 5),
        ctx_chunk("c2", "sA", 3, 2),
        ctx_chunk("c3", "sA", 1, 0),
        ctx_chunk("big", "sA", 2, 1, 999),
    ]
    result = assemble_context(chunks, {"sA": "a.pdf", "sB": "b.pdf"}, token_budget=300)
    assert [c.chunk_id for c in result.citations] == ["c3", "c2", "c1"]  # "big" didn't fit
    assert [c.label for c in result.citations] == ["S1", "S2", "S3"]
    assert result.token_count == 300
    assert result.text.startswith("[S1] (a.pdf, p. 1)")


def test_bm25_common_word_still_matches_in_tiny_notebook():
    # "index" is in 2 of 3 chunks; the classic Okapi IDF would be negative here.
    chunks = [chunk("c1", "index lookup"), chunk("c2", "index scan"), chunk("c3", "unrelated words")]
    hits = keyword_search(build_index(1, chunks), "index", Scope("nb"))
    assert {h[0] for h in hits} == {"c1", "c2"}


def test_bm25_formula_by_hand():
    import math

    index = build_index(1, [chunk("c1", "btree btree"), chunk("c2", "hash")])
    idf = math.log(1 + (2 - 1 + 0.5) / (1 + 0.5))
    expected = idf * 2 * (1.5 + 1) / (2 + 1.5 * (1 - 0.75 + 0.75 * 2 / 1.5))
    assert keyword_search(index, "btree", Scope("nb"))[0][1] == pytest.approx(expected)
