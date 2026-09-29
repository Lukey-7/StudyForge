"""Layer 2 - dense (semantic) retrieval.

Embed the question with the same model used for the chunks, then ask Chroma
for the k nearest vectors by cosine similarity inside the scope.
Finds paraphrases ("car" ~ "automobile") that keyword search misses.
"""

from app.llm.base import Embedder
from app.retrieval.scope import Scope
from app.vector_store import ChromaVectorStore


def dense_search(
    query_embedding: list[float],
    model: str,
    vectors: ChromaVectorStore,
    scope: Scope,
    k: int = 20,
) -> list[tuple[str, float]]:
    """Returns [(chunk_id, cosine_similarity)] best first."""
    return vectors.query(model, query_embedding, k=k, where=scope.to_chroma_where())


def embed_query(embedder: Embedder, query: str) -> tuple[list[float], str]:
    vector = embedder.embed_query(query)
    return vector, embedder.active_model
