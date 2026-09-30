"""Rebuild every Chroma collection from Postgres (the source of truth).

Chroma is only an index. On hosts whose disk is not persistent (Hugging Face Spaces, Cloud Run)
the index is empty after a restart, so with REINDEX_ON_START=true the API rebuilds it in the
background when it finds the passages collection empty:
    passages  -> chunks table (text as stored; no re-extraction)
    concepts  -> "name: definition" (as the knowledge build embeds them)
    claims    -> claim text, with notebook and concept ids
    sections  -> written book sections (book/sync.py::index_sections)
"""

import logging
import threading

from app.book.sync import index_sections
from app.ingest.embed import embed_and_index
from app.services import Services

logger = logging.getLogger(__name__)
BATCH = 50


def _notebook_ids(services: Services) -> list[str]:
    repo = services.repo
    if hasattr(repo, "t"):  # local JSON repository
        return sorted({s["notebook_id"] for s in repo.t["sources"].values()})
    return sorted({r["notebook_id"] for r in repo.client.table("sources").select("notebook_id").execute().data})


def _embed_rows(services: Services, rows: list[dict], text, metadata, kind: str) -> None:
    embedder = services.embedder
    for start in range(0, len(rows), BATCH):
        batch = rows[start : start + BATCH]
        vectors = embedder.embed_documents([text(r) for r in batch])
        services.vectors.upsert(embedder.active_model, [r["id"] for r in batch], vectors, [metadata(r) for r in batch], kind=kind)


def rebuild_notebook(services: Services, notebook_id: str) -> dict:
    repo, counts = services.repo, {"chunks": 0, "concepts": 0, "claims": 0, "sections": 0}
    for source in repo.list_sources(notebook_id):
        if source["status"] == "ready":
            rows = repo.list_chunks(notebook_id, [source["id"]])
            embed_and_index(rows, services.embedder, services.vectors, source["file_name"])
            counts["chunks"] += len(rows)
    try:
        concepts = repo.select("concepts", notebook_id=notebook_id)
        claims = repo.select("claims", notebook_id=notebook_id)
    except Exception:  # noqa: BLE001 - knowledge tables not migrated yet
        return counts
    _embed_rows(
        services, concepts, lambda c: f"{c['name']}: {c['definition']}", lambda c: {"notebook_id": notebook_id}, "concepts"
    )
    _embed_rows(
        services, claims, lambda c: c["text"], lambda c: {"notebook_id": notebook_id, "concept_id": c["concept_id"]}, "claims"
    )
    counts["concepts"], counts["claims"] = len(concepts), len(claims)
    try:
        for section in repo.select("book_sections", notebook_id=notebook_id):
            if section.get("indexed"):
                repo.update("book_sections", section["id"], {"indexed": False})
        counts["sections"] = index_sections(services, notebook_id)
    except Exception:  # noqa: BLE001 - book tables not migrated yet
        logger.exception("could not re-index book sections of %s", notebook_id)
    return counts


def rebuild_all(services: Services) -> None:
    for notebook_id in _notebook_ids(services):
        counts = rebuild_notebook(services, notebook_id)
        logger.info("re-indexed notebook %s: %s", notebook_id, counts)


def index_is_empty(services: Services) -> bool:
    model = services.embedder.active_model
    return services.vectors._collection(model).count() == 0  # noqa: SLF001 - passages collection


def reindex_on_start(services: Services) -> None:
    """Starts a background rebuild when the index is empty (a fresh container)."""
    if services.embedder is None or not services.settings.reindex_on_start:
        return
    try:
        if not index_is_empty(services):
            return
    except Exception:  # noqa: BLE001
        logger.exception("could not inspect the vector index")
        return

    def run() -> None:
        try:
            logger.info("vector index is empty: rebuilding it from Postgres")
            rebuild_all(services)
            logger.info("vector index rebuilt")
        except Exception:  # noqa: BLE001
            logger.exception("rebuilding the vector index failed")

    threading.Thread(target=run, name="reindex", daemon=True).start()
