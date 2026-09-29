"""Keep the book in step with the knowledge model (plan stages C, D and E).

sync_book(notebook) runs after every knowledge change (a source read, removed or rebuilt):
  1. OUTLINE  drop concepts that no longer exist; plan the outline the first time, afterwards
              only place the concepts that are new.
  2. STALE    each section has a fingerprint of its concepts' definitions, claims and evidence.
              A different fingerprint means the section is stale. No LLM involved: adding a source
              only makes stale the sections whose concepts it touched.
  3. WRITE    one Gemini call per stale section, from that section's claims and their passages
              only. Every paragraph keeps the passages it relied on (the evidence rail).
  4. VERSION  if anything was written or removed: version + 1, and a change record
              (new concepts, sections added / revised / removed) for "since you last read".
"""

import hashlib
import logging
import threading
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from app.book.outline import (
    PLACE_SYSTEM,
    PLAN_SYSTEM,
    apply_placement,
    order_outline,
    outline_from_plan,
    place_prompt,
    plan_prompt,
)
from app.book.schemas import Outline, Placement, SectionDraft, SupportVerdicts
from app.db.repository import Row
from app.llm.counting import CountingLLM
from app.services import Services

logger = logging.getLogger(__name__)

WRITE_SYSTEM = """You write one section of a textbook for a student, from their own course sources.
Write 2 to 5 paragraphs of clear, plain prose that teach the section's concepts, foundations first.
Use only the facts and passages given; never add outside knowledge. For every paragraph list the
passage numbers [P#] it relies on. Use the concept names exactly as given. Define a term the first
time it appears. No headings, no lists, no Markdown, and do not mention "the passages" or "the
sources". For see_also, name up to 3 of the other concepts listed that a reader should look at next."""

SUPPORT_SYSTEM = """You check a textbook section against its sources. For each numbered paragraph [Q#],
judge it ONLY against the passages it relies on (listed after it), never outside knowledge:
- supported: every factual statement is stated in, or directly follows from, those passages;
- partial: the main point is there, but some detail is not;
- unsupported: its main statements are not in those passages.
For partial and unsupported, give the reason in one short sentence."""

REWRITE_NOTE = """A CHECK OF YOUR DRAFT FOUND PARAGRAPHS NOT BACKED BY THEIR PASSAGES. Rewrite the whole
section so that every paragraph states only what its listed passages say. The problems:"""

_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)
_locks_guard = threading.Lock()


def _lock(notebook_id: str) -> threading.Lock:
    with _locks_guard:
        return _locks[notebook_id]


class Model:
    """The notebook's knowledge model, loaded once per sync."""

    def __init__(self, services: Services, notebook_id: str) -> None:
        repo = services.repo
        self.evidence_of: dict[str, list[Row]] = defaultdict(list)
        for evidence in repo.select("claim_evidence", notebook_id=notebook_id):
            self.evidence_of[evidence["claim_id"]].append(evidence)
        self.claims_of: dict[str, list[Row]] = defaultdict(list)
        for claim in repo.select("claims", notebook_id=notebook_id):
            if self.evidence_of[claim["id"]]:
                self.claims_of[claim["concept_id"]].append(claim)
        # Only concepts with evidence are in the book. A concept whose claims were never saved
        # (an interrupted build) waits until a rebuild gives it evidence: nothing is written from
        # a definition alone.
        self.concepts = {c["id"]: c for c in repo.select("concepts", notebook_id=notebook_id) if self.claims_of[c["id"]]}
        self.links = repo.select("concept_links", notebook_id=notebook_id)

    def fingerprint(self, concept_ids: list[str]) -> str:
        parts = []
        for cid in sorted(concept_ids):
            concept = self.concepts.get(cid, {})
            parts.append(f"{cid}|{concept.get('name')}|{concept.get('definition')}")
            for claim in sorted(self.claims_of[cid], key=lambda c: c["text"]):
                chunks = sorted(e["chunk_id"] for e in self.evidence_of[claim["id"]])
                parts.append(f"{claim['text']}|{','.join(chunks)}")  # text, not id: a rebuild re-creates claims
        return hashlib.sha1("\n".join(parts).encode()).hexdigest()


# --------------------------------------------------------------------------- entry points
def after_knowledge_change(services: Services, notebook_id: str) -> None:
    """Called after the knowledge model changed. Never raises: the book is a by-product."""
    if not services.settings.book_enabled or services.embedder is None:
        return
    try:
        sync_book(services, notebook_id)
    except Exception:  # noqa: BLE001 - e.g. migration 003 not run yet
        logger.exception("book sync failed for notebook %s", notebook_id)


def sync_book(services: Services, notebook_id: str) -> None:
    with _lock(notebook_id):  # two sources finishing together: the second sync waits, then finds little to do
        repo = services.repo
        job = repo.insert("knowledge_jobs", {"notebook_id": notebook_id, "kind": "book", "status": "running", "progress": 0})
        try:
            detail = _sync(services, notebook_id, job)
            repo.update("knowledge_jobs", job["id"], {"status": "done", "progress": 100, "detail": detail})
        except Exception as exc:
            repo.update("knowledge_jobs", job["id"], {"status": "failed", "detail": str(exc)[:300]})
            raise


def _sync(services: Services, notebook_id: str, job: Row) -> str:
    llm = CountingLLM(services.llm)
    try:
        return _sync_with(services, llm, notebook_id, job)
    finally:
        services.repo.update("knowledge_jobs", job["id"], {"llm_calls": llm.calls})


def _sync_with(services: Services, llm: CountingLLM, notebook_id: str, job: Row) -> str:
    repo = services.repo
    model = Model(services, notebook_id)
    stored = sorted(repo.select("book_sections", notebook_id=notebook_id), key=lambda s: (s["chapter_index"], s["section_index"]))

    # 1. OUTLINE: forget concepts that are gone; sections left empty are removed.
    outline, removed = [], []
    for section in stored:
        kept = [cid for cid in section["concept_ids"] if cid in model.concepts]
        if kept:
            outline.append({**section, "concept_ids": kept})
        else:
            repo.delete("book_sections", id=section["id"])
            removed.append(section["title"])
    placed = {cid for s in outline for cid in s["concept_ids"]}
    new = [c for c in model.concepts.values() if c["id"] not in placed]
    if new and not outline:
        plan = llm.generate_json(plan_prompt(new, model.links), Outline, system=PLAN_SYSTEM).data
        outline = order_outline(outline_from_plan(plan, new), model.links)
    elif new:
        placement = llm.generate_json(place_prompt(outline, new), Placement, system=PLACE_SYSTEM, fast=True).data
        outline = apply_placement(outline, new, placement)
    outline = _save_outline(repo, notebook_id, outline, {r["id"]: r for r in stored})

    # 2. STALE: a section is rewritten only when what it is built from changed.
    stale = [s for s in outline if s["status"] != "current" or s.get("fingerprint") != model.fingerprint(s["concept_ids"])]
    if not stale and not removed:
        return "The book is up to date"
    for section in stale:
        repo.update("book_sections", section["id"], {"status": "stale"})

    # 3. WRITE the stale sections (within the daily cap), each checked against its passages.
    allowance = max(0, services.settings.book_max_sections_per_day - _written_today(repo, notebook_id))
    to_write, waiting = stale[:allowance], stale[allowance:]
    book = _book(repo, notebook_id)
    version = book["version"] + 1
    sources = {s["id"]: s for s in repo.list_sources(notebook_id)}
    added, revised = [], []
    for number, section in enumerate(to_write, start=1):
        repo.update("book_sections", section["id"], {"status": "writing"})
        try:
            draft = write_section(services, llm, model, section, outline, sources)
            repo.update(
                "book_sections",
                section["id"],
                {**draft, "fingerprint": model.fingerprint(section["concept_ids"]), "status": "current", "version": version},
            )
            repo.insert(
                "book_section_versions",
                {
                    "notebook_id": notebook_id,
                    "section_id": section["id"],
                    "version": version,
                    "title": section["title"],
                    "paragraphs": draft["paragraphs"],
                    "support_rate": draft["support_rate"],
                },
            )
            (revised if section.get("version") else added).append({"id": section["id"], "title": section["title"]})
        except Exception as exc:  # noqa: BLE001 - one section failing never stops the others
            logger.exception("writing section %r failed", section["title"])
            repo.update("book_sections", section["id"], {"status": "failed"})
            if len(stale) == 1:
                raise RuntimeError(f"could not write '{section['title']}': {exc}") from exc
        repo.update("knowledge_jobs", job["id"], {"progress": int(100 * number / len(to_write)), "llm_calls": llm.calls})

    # 4. VERSION the result.
    wait_note = f"; {len(waiting)} wait for tomorrow (daily limit)" if waiting else ""
    if not added and not revised and not removed:
        return f"No sections written{wait_note}"
    changes = {"new_concepts": [c["name"] for c in new], "added": added, "revised": revised, "removed": removed}
    repo.insert("book_changes", {"notebook_id": notebook_id, "version": version, "changes": changes})
    repo.update("books", book["id"], {"version": version})
    return f"{len(added) + len(revised)} of {len(outline)} sections written{wait_note}"


def _written_today(repo, notebook_id: str) -> int:
    since = datetime.now(UTC) - timedelta(days=1)
    return sum(
        1
        for v in repo.select("book_section_versions", notebook_id=notebook_id)
        if datetime.fromisoformat(v["created_at"]) > since
    )


def _book(repo, notebook_id: str) -> Row:
    rows = repo.select("books", notebook_id=notebook_id)
    return rows[0] if rows else repo.insert("books", {"notebook_id": notebook_id, "version": 0})


def _save_outline(repo, notebook_id: str, outline: list[dict], stored: dict[str, Row]) -> list[Row]:
    """Numbers chapters and sections in reading order and stores what changed. Compares with the
    rows as stored: the outline's dicts have already been edited in place (placement, pruning)."""
    chapters = list(dict.fromkeys(s["chapter_title"] for s in outline))
    saved, counters = [], defaultdict(int)
    for section in outline:
        chapter_index = chapters.index(section["chapter_title"])
        fields = {
            "chapter_index": chapter_index,
            "chapter_title": section["chapter_title"],
            "section_index": counters[chapter_index],
            "title": section["title"],
            "concept_ids": section["concept_ids"],
        }
        counters[chapter_index] += 1
        if "id" not in section:
            saved.append(
                repo.insert(
                    "book_sections",
                    {**fields, "notebook_id": notebook_id, "status": "stale", "version": 0, "paragraphs": [], "see_also": []},
                )
            )
        elif any(stored.get(section["id"], {}).get(k) != v for k, v in fields.items()):
            saved.append(repo.update("book_sections", section["id"], fields))
        else:
            saved.append(section)
    return saved


# --------------------------------------------------------------------------- writing one section
def section_passages(services: Services, model: Model, concept_ids: list[str]) -> list[Row]:
    """The passages behind the section's claims, best-supported claims first, capped."""
    limit = services.settings.book_max_passages_per_section
    ordered: list[str] = []
    claims = [claim for cid in concept_ids for claim in model.claims_of[cid]]
    for claim in sorted(claims, key=lambda c: -len(model.evidence_of[c["id"]])):
        for evidence in model.evidence_of[claim["id"]]:
            if evidence["chunk_id"] not in ordered:
                ordered.append(evidence["chunk_id"])
    by_id = {c["id"]: c for c in services.repo.get_chunks(ordered[:limit])}
    return [by_id[i] for i in ordered[:limit] if i in by_id]


def write_prompt(section: Row, model: Model, passages: list[Row], sources: dict[str, Row], others: list[str]) -> str:
    concepts = [model.concepts[cid] for cid in section["concept_ids"]]
    lines = [f"SECTION: {section['chapter_title']} > {section['title']}", "", "CONCEPTS:"]
    lines += [f"- {c['name']}: {c['definition']}" for c in concepts]
    lines += ["", "FACTS:"]
    lines += [f"- {claim['text']}" for c in concepts for claim in model.claims_of[c["id"]]]
    lines += ["", "PASSAGES:"]
    for i, p in enumerate(passages):
        source = sources.get(p["source_id"], {}).get("file_name", "source")
        page = f", p. {p['page']}" if p.get("page") else ""
        lines += [f"[P{i}] ({source}{page})", p["text"], ""]
    if others:
        lines += ["OTHER CONCEPTS IN THE BOOK: " + "; ".join(others)]
    return "\n".join(lines)


def write_section(services: Services, llm, model: Model, section: Row, outline: list[Row], sources: dict[str, Row]) -> dict:
    """Draft, check every paragraph against its own passages, and if any paragraph is unsupported
    rewrite the section once with that feedback. The better-supported draft is kept; paragraphs that
    are still unsupported stay, marked, never silently dropped."""
    passages = section_passages(services, model, section["concept_ids"])
    if not passages:
        raise ValueError("no passages to write from")
    own = set(section["concept_ids"])
    others = [model.concepts[cid]["name"] for s in outline for cid in s["concept_ids"] if cid not in own][:60]
    prompt = write_prompt(section, model, passages, sources, others)

    draft = llm.generate_json(prompt, SectionDraft, system=WRITE_SYSTEM).data
    paragraphs = check_support(llm, _paragraphs(draft, passages), passages)
    problems = [p for p in paragraphs if p["support"] == "unsupported"]
    if problems:
        notes = "\n".join(f'- "{p["text"][:160]}...": {p["support_note"] or "not backed by its passages"}' for p in problems)
        retry = llm.generate_json(f"{prompt}\n\n{REWRITE_NOTE}\n{notes}", SectionDraft, system=WRITE_SYSTEM).data
        second = check_support(llm, _paragraphs(retry, passages), passages)
        if support_rate(second) >= support_rate(paragraphs):
            draft, paragraphs = retry, second
    known = {n.lower() for n in others}
    return {
        "paragraphs": paragraphs,
        "see_also": [n for n in dict.fromkeys(draft.see_also) if n.lower() in known][:3],
        "support_rate": support_rate(paragraphs),
    }


def _paragraphs(draft: SectionDraft, passages: list[Row]) -> list[dict]:
    paragraphs = [
        {
            "text": p.text.strip(),
            "chunk_ids": list(dict.fromkeys(passages[i]["id"] for i in p.passages if 0 <= i < len(passages))),
        }
        for p in draft.paragraphs
        if p.text.strip()
    ]
    if not paragraphs:
        raise ValueError("the model returned an empty section")
    return paragraphs


def support_prompt(paragraphs: list[dict], passages: list[Row]) -> str:
    number = {p["id"]: i for i, p in enumerate(passages)}
    lines = ["PASSAGES:"]
    for i, p in enumerate(passages):
        lines += [f"[P{i}]", p["text"], ""]
    lines.append("PARAGRAPHS:")
    for i, p in enumerate(paragraphs):
        cited = ", ".join(f"P{number[c]}" for c in p["chunk_ids"] if c in number)
        lines += [f"[Q{i}] (relies on {cited})", p["text"], ""]
    return "\n".join(lines)


def check_support(llm, paragraphs: list[dict], passages: list[Row]) -> list[dict]:
    """One call judges every paragraph against the passages it cites. A paragraph citing nothing is
    unsupported without asking; one the answer skipped is "unchecked" (never counted as supported)."""
    cited = [i for i, p in enumerate(paragraphs) if p["chunk_ids"]]
    verdicts: dict[int, tuple[str, str]] = {}
    if cited:
        result = llm.generate_json(support_prompt(paragraphs, passages), SupportVerdicts, system=SUPPORT_SYSTEM, fast=True).data
        verdicts = {v.paragraph: (v.verdict, v.reason.strip()) for v in result.verdicts if v.paragraph in cited}
    checked = []
    for i, p in enumerate(paragraphs):
        if not p["chunk_ids"]:
            support, note = "unsupported", "cites no passage"
        else:
            support, note = verdicts.get(i, ("unchecked", ""))
        checked.append({**p, "support": support, "support_note": note if support != "supported" else ""})
    return checked


def support_rate(paragraphs: list[dict]) -> float:
    """Share of paragraphs judged supported by their own passages (partial counts as not supported)."""
    return round(sum(p["support"] == "supported" for p in paragraphs) / len(paragraphs), 3) if paragraphs else 0.0
