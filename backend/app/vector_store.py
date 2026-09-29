"""ChromaDB wrapper: the SEARCH INDEX for chunk embeddings.

* Embedded mode (default): chromadb.PersistentClient stores the index in a local
  folder inside the backend process - no separate server to run.
* HTTP mode: point at a Chroma server (CHROMA_MODE=http) for multi-instance deploys.

One collection per embedding model (e.g. `chunks__text-embedding-004__768`):
vectors from different models live in different spaces and must never be
compared, so switching models simply means using (and filling) a new collection.
Each vector's metadata = {notebook_id, source_id, page, chunk_index}, which is
what the "scope filter" layer of retrieval filters on.
"""

import logging
import re

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import Settings

logger = logging.getLogger(__name__)


# HNSW is an APPROXIMATE nearest-neighbour graph. ef_search = how many candidates it explores
# per query; keeping it well above our k (20) makes results practically exact for notebook-sized data.
HNSW_CONFIG = {"hnsw": {"space": "cosine", "ef_construction": 200, "ef_search": 100}}


def collection_name(model: str, dim: int) -> str:
    slug = re.sub(r"[^a-zA-Z0-9-]", "-", model.split("/")[-1])
    return f"chunks__{slug}__{dim}"


class ChromaVectorStore:
    def __init__(self, settings: Settings, client=None) -> None:
        self.dim = settings.embedding_dim
        chroma_settings = ChromaSettings(anonymized_telemetry=False)
        if client is not None:
            self.client = client
        elif settings.chroma_mode == "http":
            self.client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port, settings=chroma_settings)
        else:
            self.client = chromadb.PersistentClient(path=settings.chroma_path, settings=chroma_settings)
        self._collections: dict[str, object] = {}

    def _collection(self, model: str):
        name = collection_name(model, self.dim)
        if name not in self._collections:
            self._collections[name] = self.client.get_or_create_collection(name=name, configuration=HNSW_CONFIG)
        return self._collections[name]

    def upsert(self, model: str, ids: list[str], embeddings: list[list[float]], metadatas: list[dict]) -> None:
        """Upsert (not add): re-ingesting a source overwrites the same ids instead of duplicating."""
        if ids:
            self._collection(model).upsert(ids=ids, embeddings=embeddings, metadatas=metadatas)

    def query(self, model: str, embedding: list[float], k: int, where: dict) -> list[tuple[str, float]]:
        """Top-k nearest chunks as (chunk_id, cosine_similarity), best first."""
        collection = self._collection(model)
        result = collection.query(query_embeddings=[embedding], n_results=k, where=where, include=["distances"])
        ids = result["ids"][0] if result["ids"] else []
        distances = result["distances"][0] if result.get("distances") else [0.0] * len(ids)
        # Chroma's cosine *distance* = 1 - cosine similarity
        return [(chunk_id, 1.0 - float(d)) for chunk_id, d in zip(ids, distances)]

    def get_embeddings(self, model: str, ids: list[str]) -> dict[str, list[float]]:
        if not ids:
            return {}
        result = self._collection(model).get(ids=ids, include=["embeddings"])
        return {i: [float(x) for x in e] for i, e in zip(result["ids"], result["embeddings"])}

    def count(self, model: str, notebook_id: str) -> int:
        result = self._collection(model).get(where={"notebook_id": notebook_id}, include=[])
        return len(result["ids"])

    def _delete_everywhere(self, where: dict) -> None:
        for info in self.client.list_collections():
            name = info if isinstance(info, str) else info.name
            if name.startswith("chunks__"):
                self.client.get_collection(name).delete(where=where)

    def delete_source(self, source_id: str) -> None:
        self._delete_everywhere({"source_id": source_id})

    def delete_notebook(self, notebook_id: str) -> None:
        self._delete_everywhere({"notebook_id": notebook_id})
