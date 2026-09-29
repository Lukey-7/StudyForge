"""Ingestion orchestration: upload -> storage -> extract -> chunk -> embed -> ready.

Status machine stored on the `sources` row (the UI polls it):
    uploaded -> extracting -> chunking -> embedding -> ready
                     \\___________\\___________\\______-> failed (error_message set)

Idempotency, at two levels:
  * same file uploaded twice to a notebook -> same sha256 -> we return the
    existing source instead of creating a new one (DB unique key backs this up);
  * re-running ingestion for a source -> chunk rows are replaced and chunk ids
    are deterministic, so Chroma upserts overwrite instead of duplicating.
"""

import hashlib
import logging
import re
import time
import uuid

from app.db.repository import Row
from app.ingest.chunk import chunk_pages
from app.ingest.embed import chunk_id, embed_and_index
from app.ingest.extract import detect_file_type, extract
from app.services import Services

logger = logging.getLogger(__name__)


class UploadTooLarge(ValueError):
    pass


def safe_file_name(name: str) -> str:
    name = name.replace("\\", "/").split("/")[-1]
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:120] or "file"


def create_source(
    services: Services, user_id: str, notebook_id: str, file_name: str, data: bytes, mime_type: str | None
) -> tuple[Row, bool]:
    """Store the original file and create the `sources` row. Returns (row, was_duplicate)."""
    file_type = detect_file_type(file_name)
    if len(data) > services.settings.max_upload_mb * 1024 * 1024:
        raise UploadTooLarge(f"file is larger than {services.settings.max_upload_mb} MB")
    if not data:
        raise ValueError("file is empty")

    content_hash = hashlib.sha256(data).hexdigest()
    existing = services.repo.find_source_by_hash(notebook_id, content_hash)
    if existing:
        return existing, True

    source_id = str(uuid.uuid4())
    storage_path = f"{user_id}/{notebook_id}/{source_id}/{safe_file_name(file_name)}"
    services.storage.put(storage_path, data, mime_type or "application/octet-stream")
    try:
        row = services.repo.create_source(
            {
                "id": source_id,
                "notebook_id": notebook_id,
                "user_id": user_id,
                "file_name": file_name[:255],
                "file_type": file_type,
                "mime_type": mime_type,
                "storage_path": storage_path,
                "content_hash": content_hash,
                "size_bytes": len(data),
                "status": "uploaded",
            }
        )
    except Exception:
        # Lost a race with an identical upload: the unique key rejected us.
        services.storage.delete([storage_path])
        existing = services.repo.find_source_by_hash(notebook_id, content_hash)
        if existing:
            return existing, True
        raise
    return row, False


def run_ingestion(services: Services, source_id: str) -> None:
    """Runs in a FastAPI BackgroundTask (a worker thread) after the upload returns."""
    repo = services.repo
    source = repo.get_source(source_id)
    if source is None:
        logger.warning("ingestion: source %s vanished", source_id)
        return
    started = time.perf_counter()
    try:
        llm, embedder = services.require_ai()

        repo.update_source(source_id, {"status": "extracting", "error_message": None})
        data = services.storage.get(source["storage_path"])
        pages = extract(source["file_name"], data, llm, services.settings.max_ocr_pages)

        repo.update_source(source_id, {"status": "chunking", "page_count": len(pages)})
        cfg = services.settings
        chunks = chunk_pages(pages, cfg.chunk_target_tokens, cfg.chunk_max_tokens, cfg.chunk_overlap_ratio)
        if not chunks:
            raise ValueError("no readable text found in this file")
        rows = [
            {
                "id": chunk_id(source_id, c.chunk_index),
                "source_id": source_id,
                "notebook_id": source["notebook_id"],
                "chunk_index": c.chunk_index,
                "page": c.page,
                "page_end": c.page_end,
                "heading": c.heading,
                "text": c.text,
                "token_count": c.token_count,
            }
            for c in chunks
        ]
        repo.replace_chunks(source_id, rows)  # Postgres first: it is the source of truth

        repo.update_source(source_id, {"status": "embedding", "chunk_count": len(rows)})
        services.vectors.delete_source(source_id)  # drop stale vectors if the new version has fewer chunks
        model = embed_and_index(rows, embedder, services.vectors, source["file_name"])

        repo.update_source(source_id, {"status": "ready", "embedding_model": model})
        repo.bump_sources_version(source["notebook_id"])
        services.bm25.invalidate(source["notebook_id"])
        if services.settings.knowledge_enabled:
            # The knowledge map is built after the source is ready and must never fail it
            # (e.g. the knowledge tables are missing because migration 002 was not run yet).
            from app.knowledge.build import build_for_source

            try:
                build_for_source(services, source_id)
            except Exception:  # noqa: BLE001
                logger.exception("knowledge build could not start for %s", source_id)
        logger.info(
            "ingested %s: %d pages, %d chunks, model=%s in %.1fs",
            source["file_name"],
            len(pages),
            len(rows),
            model,
            time.perf_counter() - started,
        )
    except Exception as exc:  # noqa: BLE001 - any failure is recorded on the row for the UI
        logger.exception("ingestion failed for %s", source_id)
        repo.update_source(source_id, {"status": "failed", "error_message": str(exc)[:500]})


def delete_source(services: Services, source: Row) -> None:
    from app.knowledge.build import remove_source_knowledge

    try:
        remove_source_knowledge(services, source)
    except Exception:  # noqa: BLE001 - deleting a source must work even without the knowledge tables
        logger.exception("could not clean up knowledge for %s", source["id"])
    services.vectors.delete_source(source["id"])
    services.storage.delete([source["storage_path"]])
    services.repo.delete_source(source["id"])  # chunks cascade
    services.repo.bump_sources_version(source["notebook_id"])
    services.bm25.invalidate(source["notebook_id"])
