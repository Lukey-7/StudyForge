"""The book (phase 2 of the living textbook): table of contents, sections with their evidence,
what changed since the reader last looked."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.api.deps import get_services, owned_notebook
from app.book.sync import after_knowledge_change
from app.db.repository import Row
from app.services import Services

router = APIRouter(tags=["book"])


def _version(services: Services, notebook_id: str) -> int:
    rows = services.repo.select("books", notebook_id=notebook_id)
    return rows[0]["version"] if rows else 0


def _read_row(services: Services, notebook: Row) -> Row:
    """The reader's bookmark. A reader who has never opened the book starts at the current
    version: a brand-new book is not "what changed"."""
    rows = services.repo.select("book_reads", notebook_id=notebook["id"], user_id=notebook["user_id"])
    if rows and rows[0]["last_seen_version"] == 0 and (version := _version(services, notebook["id"])):
        # opened while the book was still empty: its first edition is not "what changed" either
        return services.repo.update("book_reads", rows[0]["id"], {"last_seen_version": version})
    if rows:
        return rows[0]
    return services.repo.insert(
        "book_reads",
        {"notebook_id": notebook["id"], "user_id": notebook["user_id"], "last_seen_version": _version(services, notebook["id"])},
    )


def _changes_since(services: Services, notebook_id: str, seen: int) -> dict:
    merged: dict = {"new_concepts": [], "added": [], "revised": [], "removed": []}
    for row in services.repo.select("book_changes", notebook_id=notebook_id):
        if row["version"] > seen:
            for key in merged:
                merged[key] += row["changes"].get(key, [])
    for key in ("added", "revised"):  # a section revised twice is listed once, as its latest title
        merged[key] = list({item["id"]: item for item in merged[key]}.values())
    added = {item["id"] for item in merged["added"]}
    merged["revised"] = [item for item in merged["revised"] if item["id"] not in added]  # new to this reader, not "revised"
    merged["new_concepts"] = list(dict.fromkeys(merged["new_concepts"]))
    return merged


def _job(services: Services, notebook_id: str) -> Row | None:
    jobs = [j for j in services.repo.select("knowledge_jobs", notebook_id=notebook_id) if j.get("kind") == "book"]
    if not jobs:
        return None
    job = jobs[-1]
    return {"status": job["status"], "progress": job["progress"], "detail": job.get("detail")}


@router.get("/notebooks/{notebook_id}/book")
def book(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    sections = sorted(
        services.repo.select("book_sections", notebook_id=notebook["id"]), key=lambda s: (s["chapter_index"], s["section_index"])
    )
    seen = _read_row(services, notebook)["last_seen_version"]
    chapters: list[dict] = []
    for s in sections:
        if not chapters or chapters[-1]["index"] != s["chapter_index"]:
            chapters.append({"index": s["chapter_index"], "title": s["chapter_title"], "sections": []})
        chapters[-1]["sections"].append(
            {
                "id": s["id"],
                "title": s["title"],
                "status": s["status"],
                "version": s["version"],
                "revised": s["status"] == "current" and s["version"] > seen,
            }
        )
    return {
        "version": _version(services, notebook["id"]),
        "last_seen_version": seen,
        "chapters": chapters,
        "changes": _changes_since(services, notebook["id"], seen),
        "job": _job(services, notebook["id"]),
    }


@router.get("/notebooks/{notebook_id}/book/sections/{section_id}")
def section(section_id: str, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    repo = services.repo
    found = repo.select("book_sections", id=section_id, notebook_id=notebook["id"])
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "section not found")
    s = found[0]
    chunk_ids = list(dict.fromkeys(cid for p in s["paragraphs"] for cid in p.get("chunk_ids", [])))
    chunks = {c["id"]: c for c in repo.get_chunks(chunk_ids)}
    sources = {src["id"]: src for src in repo.list_sources(notebook["id"])}
    concepts = {c["id"]: c for c in repo.select("concepts", notebook_id=notebook["id"])}

    def evidence(chunk_id: str) -> dict | None:
        chunk = chunks.get(chunk_id)
        if chunk is None:  # its source was removed; the section is being rewritten
            return None
        return {
            "chunk_id": chunk_id,
            "source_id": chunk["source_id"],
            "source_name": sources.get(chunk["source_id"], {}).get("file_name", "source"),
            "page": chunk.get("page"),
        }

    return {
        "id": s["id"],
        "chapter_title": s["chapter_title"],
        "title": s["title"],
        "status": s["status"],
        "version": s["version"],
        "concepts": [{"id": cid, "name": concepts[cid]["name"]} for cid in s["concept_ids"] if cid in concepts],
        "paragraphs": [
            {"text": p["text"], "evidence": [e for e in map(evidence, p.get("chunk_ids", [])) if e]} for p in s["paragraphs"]
        ],
        "see_also": [
            {"id": c["id"], "name": c["name"]}
            for name in s.get("see_also") or []
            for c in concepts.values()
            if c["name"].lower() == name.lower()
        ],
    }


@router.post("/notebooks/{notebook_id}/book/write", status_code=status.HTTP_202_ACCEPTED)
def write(
    background: BackgroundTasks, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)
) -> dict:
    """Brings the book up to date (only stale sections are written). Normally automatic."""
    if services.embedder is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI is not configured (GEMINI_API_KEY missing)")
    background.add_task(after_knowledge_change, services, notebook["id"])
    return {"status": "started"}


@router.post("/notebooks/{notebook_id}/book/seen")
def seen(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    row = _read_row(services, notebook)
    version = _version(services, notebook["id"])
    services.repo.update("book_reads", row["id"], {"last_seen_version": version})
    return {"last_seen_version": version}
