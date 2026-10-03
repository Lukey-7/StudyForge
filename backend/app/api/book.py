"""The book (phase 2 of the living textbook): table of contents, sections with their evidence,
what changed since the reader last looked."""

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.api.deps import get_services, get_user, owned_notebook
from app.auth import User
from app.book import export as book_export
from app.book.figures import chapter_map, chapter_timeline, chart_data, comparisons, steps_diagram
from app.book.index import book_index, section_numbers
from app.book.learner import STYLES, explain_section, search
from app.book.sync import DEFAULT_SETTINGS, after_knowledge_change, book_settings, revert_book
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
    return {
        "status": job["status"],
        "progress": job["progress"],
        "detail": job.get("detail"),
        "llm_calls": job.get("llm_calls", 0),
    }


@router.get("/notebooks/{notebook_id}/book")
def book(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    sections = sorted(
        services.repo.select("book_sections", notebook_id=notebook["id"]), key=lambda s: (s["chapter_index"], s["section_index"])
    )
    reads = _read_row(services, notebook)
    seen = reads["last_seen_version"]
    read = set(reads.get("read_sections") or [])
    disputed = _disputed_concepts(services, notebook["id"])
    concepts = {c["id"]: c for c in services.repo.select("concepts", notebook_id=notebook["id"])}
    links = services.repo.select("concept_links", notebook_id=notebook["id"])
    numbers = section_numbers(sections)
    chapters: list[dict] = []
    for s in sections:
        if not chapters or chapters[-1]["index"] != s["chapter_index"]:
            chapters.append({"index": s["chapter_index"], "title": s["chapter_title"], "sections": [], "concept_ids": []})
        chapters[-1]["concept_ids"] += s["concept_ids"]
        chapters[-1]["sections"].append(
            {
                "id": s["id"],
                "number": numbers[s["id"]],
                "title": s["title"],
                "status": s["status"],
                "version": s["version"],
                "revised": s["status"] == "current" and s["version"] > seen,
                "support_rate": s.get("support_rate"),
                "disputed": any(cid in disputed for cid in s["concept_ids"]),
                "read": s["id"] in read,
                "concept_ids": s["concept_ids"],
            }
        )
    events = _optional(services, "timeline_events", notebook["id"])
    for chapter in chapters:
        ids = chapter.pop("concept_ids")
        chapter["map"] = chapter_map(ids, concepts, links)
        chapter["timeline"] = chapter_timeline(ids, events)
    scores = reads.get("quiz_scores") or {}
    written = [s for s in sections if s["status"] == "current"]
    return {
        "progress": {"read": len([s for s in written if s["id"] in read]), "total": len(written)},
        "quiz_scores": scores,
        "weak_spots": [
            {"chapter": ch["title"], "section_id": ch["sections"][0]["id"], **scores[ch["title"]]}
            for ch in chapters
            if ch["title"] in scores and scores[ch["title"]]["score"] < 0.7 * scores[ch["title"]]["total"]
        ],
        "version": _version(services, notebook["id"]),
        "last_seen_version": seen,
        "chapters": chapters,
        "changes": _changes_since(services, notebook["id"], seen),
        "job": _job(services, notebook["id"]),
        "support": _support_summary(sections),
        "settings": book_settings(services.repo, notebook["id"]),
    }


def _support_summary(sections: list[Row]) -> dict:
    """Book-wide: how many paragraphs a check found supported by their own passages."""
    counts = {"supported": 0, "partial": 0, "unsupported": 0, "unchecked": 0}
    for s in sections:
        for p in s["paragraphs"]:
            counts[p.get("support", "unchecked")] = counts.get(p.get("support", "unchecked"), 0) + 1
    total = sum(counts.values())
    return {**counts, "paragraphs": total, "rate": round(counts["supported"] / total, 3) if total else None}


def _disputed_concepts(services: Services, notebook_id: str) -> set[str]:
    return {c["id"] for c in services.repo.select("concepts", notebook_id=notebook_id, status="conflicted")}


@router.get("/notebooks/{notebook_id}/book/sections/{section_id}")
def section(
    section_id: str,
    version: int | None = None,
    notebook: Row = Depends(owned_notebook),
    services: Services = Depends(get_services),
) -> dict:
    """The section as it is now, or with ?version=n as it was written in book version n."""
    repo = services.repo
    found = repo.select("book_sections", id=section_id, notebook_id=notebook["id"])
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "section not found")
    s = found[0]
    history = sorted(repo.select("book_section_versions", section_id=section_id), key=lambda v: v["version"])
    if version is not None and version != s["version"]:
        snapshot = next((v for v in history if v["version"] == version), None)
        if snapshot is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "this section was not written in that version")
        s = {
            **s,
            "title": snapshot["title"],
            "paragraphs": snapshot["paragraphs"],
            "version": version,
            "support_rate": snapshot["support_rate"],
        }
    code_chunks = [cid for c in (s.get("extras") or {}).get("code_examples") or [] for cid in c.get("chunk_ids", [])]
    chunk_ids = list(dict.fromkeys([*(cid for p in s["paragraphs"] for cid in p.get("chunk_ids", [])), *code_chunks]))
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

    extras = s.get("extras") or {}
    every = sorted(
        repo.select("book_sections", notebook_id=notebook["id"]), key=lambda r: (r["chapter_index"], r["section_index"])
    )
    return {
        "id": s["id"],
        "number": section_numbers(every).get(s["id"], ""),
        "chapter_title": s["chapter_title"],
        "title": s["title"],
        "status": s["status"],
        "version": s["version"],
        "code_examples": [
            {
                **{k: v for k, v in c.items() if k != "chunk_ids"},
                "evidence": [e for e in map(evidence, c.get("chunk_ids", [])) if e],
            }
            for c in extras.get("code_examples") or []
        ],
        "steps": {
            "title": extras.get("steps_title", ""),
            "items": extras.get("steps") or [],
            "diagram": steps_diagram(extras.get("steps") or []),
        },  # fmt: skip
        "concepts": [{"id": cid, "name": concepts[cid]["name"]} for cid in s["concept_ids"] if cid in concepts],
        "current_version": found[0]["version"],
        "comparisons": _comparisons(services, notebook["id"], s["concept_ids"], concepts),
        "charts": [
            {**chart_data(t), "evidence": evidence(t["chunk_id"])}
            for t in _optional(services, "data_tables", notebook["id"])
            if t["concept_id"] in s["concept_ids"]
        ],
        "versions": [v["version"] for v in history],
        "support_rate": s.get("support_rate"),
        "paragraphs": [
            {
                "text": p["text"],
                "evidence": [e for e in map(evidence, p.get("chunk_ids", [])) if e],
                "support": p.get("support", "unchecked"),
                "support_note": p.get("support_note", ""),
            }
            for p in s["paragraphs"]
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


@router.get("/notebooks/{notebook_id}/book/history")
def history(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> list[dict]:
    """Every version of the book and what it changed, newest first."""
    rows = services.repo.select("book_changes", notebook_id=notebook["id"])
    kept = {r["version"] for r in _optional(services, "book_snapshots", notebook["id"])}
    current = _version(services, notebook["id"])
    return [
        {
            "version": r["version"],
            "created_at": r["created_at"],
            "changes": r["changes"],
            "can_revert": r["version"] in kept and r["version"] != current,
        }  # fmt: skip
        for r in reversed(rows)
    ]


@router.get("/notebooks/{notebook_id}/conflicts")
def conflicts(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> list[dict]:
    """Every place where a source contradicts what the book says, with both passages."""
    repo, notebook_id = services.repo, notebook["id"]
    rows = repo.select("conflicts", notebook_id=notebook_id)
    if not rows:
        return []
    claims = {c["id"]: c for c in repo.select("claims", notebook_id=notebook_id)}
    concepts = {c["id"]: c for c in repo.select("concepts", notebook_id=notebook_id)}
    sources = {s["id"]: s for s in repo.list_sources(notebook_id)}
    evidence_of: dict[str, list[Row]] = {}
    for e in repo.select("claim_evidence", notebook_id=notebook_id):
        evidence_of.setdefault(e["claim_id"], []).append(e)
    section_of = {cid: s for s in repo.select("book_sections", notebook_id=notebook_id) for cid in s["concept_ids"]}

    def view(e: Row) -> dict:
        return {
            "chunk_id": e["chunk_id"],
            "source_id": e["source_id"],
            "source_name": sources.get(e["source_id"], {}).get("file_name", "source"),
            "page": e.get("page"),
        }

    out = []
    for c in rows:
        claim = claims.get(c["claim_id"])
        if claim is None:
            continue
        concept = concepts.get(claim["concept_id"], {})
        section = section_of.get(claim["concept_id"])
        out.append(
            {
                "id": c["id"],
                "concept": {"id": claim["concept_id"], "name": concept.get("name", "")},
                "section": {"id": section["id"], "title": section["title"]} if section else None,
                "claim_text": claim["text"],
                "claim_evidence": [view(e) for e in evidence_of.get(claim["id"], [])],
                "contradicting_text": c["contradicting_text"],
                "contradicting_evidence": view(c),
            }
        )
    return out


def _comparisons(services: Services, notebook_id: str, concept_ids: list[str], concepts: dict[str, Row]) -> list[dict]:
    links = services.repo.select("concept_links", notebook_id=notebook_id)
    if not any(link["kind"] == "contrasts_with" for link in links):
        return []
    evidence = {e["claim_id"] for e in services.repo.select("claim_evidence", notebook_id=notebook_id)}
    claims_of: dict[str, list[str]] = {}
    for c in services.repo.select("claims", notebook_id=notebook_id):
        if c["id"] in evidence:
            claims_of.setdefault(c["concept_id"], []).append(c["text"])
    return comparisons(concept_ids, concepts, links, claims_of)


# ---------------------------------------------------------------- phase 4: export
@router.get("/notebooks/{notebook_id}/book/export")
def export(
    format: Literal["md", "epub"] = "md", notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)
) -> Response:
    book = book_export.assemble(services, notebook)
    if format == "epub":
        body, media = book_export.to_epub(book, notebook["id"]), "application/epub+zip"
    else:
        body, media = book_export.to_markdown(book).encode(), "text/markdown; charset=utf-8"
    name = book_export.filename(notebook["title"], format)
    return Response(body, media_type=media, headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------- phase 5: the learner in the loop
class ReadMark(BaseModel):
    read: bool = True


@router.post("/notebooks/{notebook_id}/book/sections/{section_id}/read")
def mark_read(
    section_id: str, body: ReadMark, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)
) -> dict:
    row = _read_row(services, notebook)
    read = [s for s in row.get("read_sections") or [] if s != section_id] + ([section_id] if body.read else [])
    services.repo.update("book_reads", row["id"], {"read_sections": read})
    return {"read_sections": read}


class QuizResult(BaseModel):
    chapter: str = Field(max_length=300)
    score: int = Field(ge=0)
    total: int = Field(gt=0)


@router.post("/notebooks/{notebook_id}/book/quiz-result")
def quiz_result(body: QuizResult, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    """The latest "Quiz me on this chapter" score; chapters under 70% become weak spots."""
    if body.score > body.total:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "score is larger than total")
    row = _read_row(services, notebook)
    scores = {**(row.get("quiz_scores") or {}), body.chapter: {"score": body.score, "total": body.total}}
    services.repo.update("book_reads", row["id"], {"quiz_scores": scores})
    return {"quiz_scores": scores}


class ExplainRequest(BaseModel):
    style: Literal["simpler", "steps"] = "simpler"


@router.post("/notebooks/{notebook_id}/book/sections/{section_id}/explain")
def explain(
    section_id: str, body: ExplainRequest, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)
) -> dict:
    found = services.repo.select("book_sections", id=section_id, notebook_id=notebook["id"])
    if not found or not found[0].get("paragraphs"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "section not found or not written yet")
    if services.embedder is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI is not configured (GEMINI_API_KEY missing)")
    assert body.style in STYLES
    return explain_section(services, found[0], body.style)


@router.get("/search")
def search_everything(
    q: str = Query(min_length=2, max_length=200), user: User = Depends(get_user), services: Services = Depends(get_services)
) -> list[dict]:
    """Concepts and book sections across every notebook of the user."""
    return search(services, user.id, q)


def _optional(services: Services, table: str, notebook_id: str) -> list[Row]:
    """Rows of a table added by a later migration; empty (not an error) until it is run."""
    try:
        return services.repo.select(table, notebook_id=notebook_id)
    except Exception:  # noqa: BLE001
        return []


# ---------------------------------------------------------------- the index, settings, editions
@router.get("/notebooks/{notebook_id}/book/index")
def index(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> list[dict]:
    """The back-of-book index: every concept and alias, A-Z, with the numbered sections that teach
    it (main entries) or mention it."""
    repo = services.repo
    return book_index(
        repo.select("book_sections", notebook_id=notebook["id"]), repo.select("concepts", notebook_id=notebook["id"])
    )


class BookSettings(BaseModel):
    audience: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    depth: Literal["concise", "standard", "detailed"] = "standard"
    examples: bool = True
    code: bool = True


@router.get("/notebooks/{notebook_id}/book/settings")
def get_settings_(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    return book_settings(services.repo, notebook["id"])


@router.put("/notebooks/{notebook_id}/book/settings")
def put_settings(
    body: BookSettings,
    background: BackgroundTasks,
    notebook: Row = Depends(owned_notebook),
    services: Services = Depends(get_services),
) -> dict:
    """Saves how the reader wants the book written. A change rewrites the book in the background
    (every section's fingerprint includes the settings)."""
    repo, new = services.repo, body.model_dump()
    rows = repo.select("books", notebook_id=notebook["id"])
    book = rows[0] if rows else repo.insert("books", {"notebook_id": notebook["id"], "version": 0})
    if new == book_settings(repo, notebook["id"]):
        return {**new, "rewriting": False}
    try:
        repo.update("books", book["id"], {"settings": new})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_409_CONFLICT, "run migration 007_book_reader.sql to enable book settings") from exc
    if services.embedder is not None:
        background.add_task(after_knowledge_change, services, notebook["id"])
    return {**new, "rewriting": True}


class Revert(BaseModel):
    version: int


@router.post("/notebooks/{notebook_id}/book/revert")
def revert(body: Revert, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    """Makes the book read as it did at one of the last kept versions (as a new version)."""
    try:
        new_version = revert_book(services, notebook["id"], body.version)
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return {"version": new_version, "reverted_to": body.version}


assert set(BookSettings().model_dump()) == set(DEFAULT_SETTINGS)  # the API and the writer agree on the settings
