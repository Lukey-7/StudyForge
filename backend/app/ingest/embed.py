"""Step 3 of ingestion: chunk rows -> vectors in Chroma."""

import uuid

from app.db.repository import Row
from app.llm.base import Embedder
from app.vector_store import ChromaVectorStore

# Fixed namespace so the same (source, chunk_index) always gets the same id.
CHUNK_NAMESPACE = uuid.UUID("5b6f1c2e-7d0a-4c1e-9f3a-2a8e4d6b9c10")


def chunk_id(source_id: str, chunk_index: int) -> str:
    """Deterministic id (uuid5). Re-ingesting a source produces the SAME ids, so the
    Chroma upsert overwrites instead of duplicating - this is what makes it idempotent."""
    return str(uuid.uuid5(CHUNK_NAMESPACE, f"{source_id}:{chunk_index}"))


def chroma_metadata(row: Row) -> dict:
    # Chroma metadata values cannot be None, so an unknown page is stored as 0.
    return {
        "notebook_id": row["notebook_id"],
        "source_id": row["source_id"],
        "page": row.get("page") or 0,
        "chunk_index": row["chunk_index"],
    }


def contextual_text(row: Row, source_name: str) -> str:
    """Contextual chunk header: prepend WHERE the chunk comes from before embedding.

    A chunk saying "it has O(log n) lookups" is ambiguous on its own; with
    "Document: dbms_notes.pdf / Section: 3. Indexing" in front, its vector also
    encodes the topic, so questions about B-tree indexes find it more reliably.
    Only the embedding sees the header - the stored chunk text is unchanged."""
    header = f"Document: {source_name}"
    if row.get("heading"):
        header += f"\nSection: {row['heading']}"
    return f"{header}\n\n{row['text']}"


def embed_and_index(rows: list[Row], embedder: Embedder, vectors: ChromaVectorStore, source_name: str) -> str:
    """Embed chunk texts (with contextual headers) in batches and upsert into Chroma.
    Returns the embedding model actually used."""
    if not rows:
        return embedder.active_model
    texts = [contextual_text(r, source_name) for r in rows]
    embeddings = embedder.embed_documents(texts)
    model = embedder.active_model  # read AFTER embedding: the fallback may have kicked in
    vectors.upsert(
        model,
        ids=[r["id"] for r in rows],
        embeddings=embeddings,
        metadatas=[chroma_metadata(r) for r in rows],
    )
    return model
