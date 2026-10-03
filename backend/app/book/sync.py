"""Keep the book in step with the knowledge model (plan stages C, D and E).

sync_book(notebook) runs after every knowledge change (a source read, removed or rebuilt):
  1. OUTLINE  drop concepts that no longer exist; plan the outline the first time, afterwards
              only place the concepts that are new.
  2. STALE    each section has a fingerprint of its concepts' definitions, claims and evidence.
              A different fingerprint means the section is stale. No LLM involved: adding a source
              only makes stale the sections whose concepts it touched.
  3. WRITE    one Gemini call per stale section, from that section's claims and their passages
              only. Every paragraph keeps the passages it relied on (the evidence rail).
  4. VERSION  if anything was written or removed: version + 1, a change record (new concepts,
              sections added / revised / removed) for "since you last read", and a snapshot of
              the whole book (the last 5 are kept, so the reader can revert to one of them).

The reader's settings (level, depth, examples, code) shape every section; changing them makes
every section stale. A paragraph that repeats another section's paragraph is removed.
"""

import hashlib
import json
import logging
import re
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

DEFAULT_SETTINGS = {"audience": "intermediate", "depth": "standard", "examples": True, "code": True}
AUDIENCE = {  # style only: no level may add facts the passages do not state
    "beginner": (
        "The reader is new to the subject. Use short sentences (mostly under 20 words) and everyday words. Spell out "
        'every abbreviation. After each technical sentence, restate the idea in plain words ("In other words, ..."), '
        "using only what the passages say."
    ),
    "intermediate": "The reader knows the basics of the subject: explain clearly without over-simplifying.",
    "advanced": (
        "The reader is advanced: write compactly in precise technical language, combine related facts into dense "
        "sentences, and skip plain-word restatements and basic definitions of standard terms."
    ),
}
PARAGRAPHS = {"concise": "1 to 3", "standard": "2 to 5", "detailed": "4 to 7"}


def write_system(settings: dict) -> str:
    """The writer's instructions for this reader (see DEFAULT_SETTINGS)."""
    lines = [
        "You write one section of a textbook for a student, from their own course sources.",
        f"Write {PARAGRAPHS[settings['depth']]} paragraphs of clear, plain prose that teach the section's concepts, "
        "foundations first. " + AUDIENCE[settings["audience"]],
        "Every sentence must be stated in, or follow directly from, the facts and passages given. Do not add background",
        "you know from elsewhere (who a person was, what hardware something runs on, extra properties or history), even",
        "when it is true: the paragraph is checked against its passages. For every paragraph list the",
        "passage numbers [P#] it relies on. Use the concept names exactly as given. Define a term the first time it",
        "appears. Concepts listed under TAUGHT ELSEWHERE are explained in other sections of the book: mention them by",
        "name where useful, but never define or explain them again. Paragraphs are plain prose: no headings, no lists,",
        'no Markdown, and do not mention "the passages" or "the sources".',
    ]
    if settings["examples"]:
        lines.append("Where it helps understanding, use a concrete example that the passages give.")
    if settings["code"]:
        lines.append(
            "CODE IN THE PASSAGES lists the code blocks your passages contain. Put every one that demonstrates this "
            "section's concepts into code_examples, copied exactly, with from_sources=true and its passage number."
        )
        if settings["examples"]:
            lines.append(
                "Only if there is no code in the passages and the section is about programming or a query language, you "
                "may add one short code example with from_sources=false; it is labelled as illustrative."
            )
    else:
        lines.append("Leave code_examples empty.")
    lines.append(
        "If the passages describe a process or algorithm as ordered steps, give those steps (3 to 8 short steps, in "
        "order) with a steps_title; otherwise leave steps empty."
    )
    lines.append("For see_also, name up to 3 of the concepts under TAUGHT ELSEWHERE that a reader should look at next.")
    return "\n".join(lines)


def book_settings(repo, notebook_id: str) -> dict:
    rows = repo.select("books", notebook_id=notebook_id)
    stored = (rows[0].get("settings") or {}) if rows else {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in stored.items() if k in DEFAULT_SETTINGS}}


def settings_key(settings: dict) -> str:
    """Part of every section's fingerprint: changing the settings rewrites the book. Empty for the
    defaults, so books written before settings existed are not rewritten."""
    return "" if settings == DEFAULT_SETTINGS else "|" + json.dumps(settings, sort_keys=True)


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
        self.services, self.notebook_id = services, notebook_id
        self._code_passages: list[tuple[Row, str]] | None = None
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
        self.settings = book_settings(repo, notebook_id)

    def code_passages(self) -> list[tuple[Row, str]]:
        """(passage, context) for every passage that contains a code block, loaded once per sync.
        The context is the text just before each block plus the code itself."""
        if self._code_passages is None:
            self._code_passages = []
            for chunk in self.services.repo.list_chunks(self.notebook_id):
                contexts = [chunk["text"][max(0, m.start() - 400) : m.end()] for m in _CODE_BLOCK.finditer(chunk["text"])]
                if contexts:
                    self._code_passages.append((chunk, " ".join(contexts)))
        return self._code_passages

    def fingerprint(self, concept_ids: list[str]) -> str:
        parts = []
        for cid in sorted(concept_ids):
            concept = self.concepts.get(cid, {})
            parts.append(f"{cid}|{concept.get('name')}|{concept.get('definition')}")
            for claim in sorted(self.claims_of[cid], key=lambda c: c["text"]):
                chunks = sorted(e["chunk_id"] for e in self.evidence_of[claim["id"]])
                parts.append(f"{claim['text']}|{','.join(chunks)}")  # text, not id: a rebuild re-creates claims
        return hashlib.sha1("\n".join(parts).encode()).hexdigest() + settings_key(self.settings)


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
        detail = _sync_with(services, llm, notebook_id, job)
    finally:
        services.repo.update("knowledge_jobs", job["id"], {"llm_calls": llm.calls})
    try:
        index_sections(services, notebook_id)
    except Exception:  # noqa: BLE001 - search falls back to word overlap; never fails the book
        logger.exception("could not index book sections of %s", notebook_id)
    return detail


def section_text(section: Row) -> str:
    return section["title"] + ". " + " ".join(p["text"] for p in section.get("paragraphs") or [])


def index_sections(services: Services, notebook_id: str) -> int:
    """Embeds written sections that are not indexed yet (new or rewritten) into the "sections"
    collection, for "ask the book" and search by meaning. Returns how many were embedded."""
    todo = [
        s
        for s in services.repo.select("book_sections", notebook_id=notebook_id)
        if s["status"] == "current" and s.get("paragraphs") and not s.get("indexed")
    ]
    if not todo:
        return 0
    embedder = services.embedder
    vectors = embedder.embed_documents([section_text(s) for s in todo])
    services.vectors.upsert(
        embedder.active_model, [s["id"] for s in todo], vectors, [{"notebook_id": notebook_id} for _ in todo], kind="sections"
    )
    for s in todo:
        services.repo.update("book_sections", s["id"], {"indexed": True})
    return len(todo)


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
            services.vectors.delete_ids(services.embedder.active_model, [section["id"]], "sections")
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
    texts = {s["id"]: [p["text"] for p in s.get("paragraphs") or []] for s in outline}  # what each section says now
    codes = {s["id"]: {_code_key(c["code"]) for c in (s.get("extras") or {}).get("code_examples") or []} for s in outline}
    repeats = 0
    for number, section in enumerate(to_write, start=1):
        repo.update("book_sections", section["id"], {"status": "writing"})
        try:
            draft = write_section(services, llm, model, section, outline, sources)
            others = [t for sid, paragraphs in texts.items() if sid != section["id"] for t in paragraphs]
            draft["paragraphs"], dropped = drop_repeats(draft["paragraphs"], others, services.settings.book_repeat_threshold)
            shown = {key for sid, keys in codes.items() if sid != section["id"] for key in keys}
            examples = draft["extras"]["code_examples"]
            draft["extras"]["code_examples"] = [c for c in examples if _code_key(c["code"]) not in shown]  # once per book
            dropped += len(examples) - len(draft["extras"]["code_examples"])
            codes[section["id"]] = {_code_key(c["code"]) for c in draft["extras"]["code_examples"]}
            draft["support_rate"] = support_rate(draft["paragraphs"])
            repeats += dropped
            texts[section["id"]] = [p["text"] for p in draft["paragraphs"]]
            update_section(
                repo,
                section["id"],
                {
                    **draft,
                    "fingerprint": model.fingerprint(section["concept_ids"]),
                    "status": "current",
                    "version": version,
                    "indexed": False,  # re-embedded after this sync
                },
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
    repeat_note = f"; {repeats} repeat{'s' if repeats != 1 else ''} removed" if repeats else ""
    if not added and not revised and not removed:
        return f"No sections written{wait_note}"
    changes = {"new_concepts": [c["name"] for c in new], "added": added, "revised": revised, "removed": removed}
    repo.insert("book_changes", {"notebook_id": notebook_id, "version": version, "changes": changes})
    repo.update("books", book["id"], {"version": version})
    save_snapshot(services, notebook_id, version)
    return f"{len(added) + len(revised)} of {len(outline)} sections written{repeat_note}{wait_note}"


def update_section(repo, section_id: str, fields: dict) -> Row:
    """Stores a written section. Before migration 007 there is no `extras` column: store the rest."""
    try:
        return repo.update("book_sections", section_id, fields)
    except Exception as exc:  # noqa: BLE001
        if "extras" not in fields or "extras" not in str(exc):
            raise
        logger.warning("book_sections.extras is missing (run migration 007); storing the section without it")
        return repo.update("book_sections", section_id, {k: v for k, v in fields.items() if k != "extras"})


# --------------------------------------------------------------------------- repeated paragraphs
_WORD = re.compile(r"[a-z0-9]+")


def shingles(text: str, n: int = 3) -> set[tuple[str, ...]]:
    words = _WORD.findall(text.lower())
    return {tuple(words[i : i + n]) for i in range(max(1, len(words) - n + 1))} if words else set()


def overlap(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def _code_key(code: str) -> str:
    """Code compared without whitespace differences."""
    return re.sub(r"\s+", "", code)


def drop_repeats(paragraphs: list[dict], other_texts: list[str], threshold: float) -> tuple[list[dict], int]:
    """Removes paragraphs that say what another section already says (word 3-shingle overlap at or
    above the threshold). A section always keeps at least its first paragraph."""
    others = [shingles(t) for t in other_texts]
    kept = [p for p in paragraphs if not any(overlap(shingles(p["text"]), o) >= threshold for o in others)]
    if not kept:
        kept = paragraphs[:1]
    return kept, len(paragraphs) - len(kept)


# --------------------------------------------------------------------------- editions: snapshots and revert
SNAPSHOT_FIELDS = ("chapter_index", "chapter_title", "section_index", "title", "concept_ids", "paragraphs", "see_also",
                   "support_rate", "extras")  # fmt: skip


def save_snapshot(services: Services, notebook_id: str, version: int) -> None:
    """The whole book at this version; only the last `book_max_versions` are kept."""
    repo = services.repo
    try:
        sections = sorted(
            repo.select("book_sections", notebook_id=notebook_id), key=lambda s: (s["chapter_index"], s["section_index"])
        )
        repo.insert(
            "book_snapshots",
            {
                "notebook_id": notebook_id,
                "version": version,
                "sections": [{k: s.get(k) for k in SNAPSHOT_FIELDS} for s in sections],
            },
        )
        snapshots = sorted(repo.select("book_snapshots", notebook_id=notebook_id), key=lambda r: r["version"])
        for old in snapshots[: -services.settings.book_max_versions]:
            repo.delete("book_snapshots", id=old["id"])
    except Exception:  # noqa: BLE001 - e.g. migration 007 not run: the book itself is fine
        logger.exception("could not save a snapshot of the book")


def revert_book(services: Services, notebook_id: str, version: int) -> int:
    """Makes the book read as it did at `version` (one of the kept snapshots) and returns the new
    version number. Sections whose concepts no longer exist (their sources were removed) are left
    out. The reverted text stays until the sources or the settings change again."""
    with _lock(notebook_id):
        repo = services.repo
        snapshot = next((r for r in repo.select("book_snapshots", notebook_id=notebook_id) if r["version"] == version), None)
        if snapshot is None:
            raise LookupError(f"version {version} is not kept")
        model = Model(services, notebook_id)
        current = repo.select("book_sections", notebook_id=notebook_id)
        for section in current:
            repo.delete("book_sections", id=section["id"])
        if services.embedder is not None:
            services.vectors.delete_ids(services.embedder.active_model, [s["id"] for s in current], "sections")
        book = _book(repo, notebook_id)
        new_version = book["version"] + 1
        restored = 0
        for saved in snapshot["sections"]:
            concept_ids = [cid for cid in saved.get("concept_ids") or [] if cid in model.concepts]
            if not concept_ids:
                continue
            fields = {k: saved.get(k) for k in SNAPSHOT_FIELDS if saved.get(k) is not None}
            fields.update(
                notebook_id=notebook_id, concept_ids=concept_ids, status="current", version=new_version, indexed=False,
                fingerprint=model.fingerprint(concept_ids),
            )  # fmt: skip
            try:
                repo.insert("book_sections", fields)
            except Exception as exc:  # noqa: BLE001 - before migration 007: no extras column
                if "extras" not in str(exc):
                    raise
                repo.insert("book_sections", {k: v for k, v in fields.items() if k != "extras"})
            restored += 1
        changes = {"reverted_to": version, "new_concepts": [], "added": [], "revised": [], "removed": []}
        repo.insert("book_changes", {"notebook_id": notebook_id, "version": new_version, "changes": changes})
        repo.update("books", book["id"], {"version": new_version})
        save_snapshot(services, notebook_id, new_version)
    try:
        index_sections(services, notebook_id)
    except Exception:  # noqa: BLE001
        logger.exception("could not index the reverted sections")
    logger.info("book of %s reverted to version %s as version %s (%d sections)", notebook_id, version, new_version, restored)
    return new_version


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


_CODE_BLOCK = re.compile(r"```[\w+-]*\n(.*?)```", re.S)


def code_blocks(passages: list[Row]) -> list[tuple[int, str]]:
    """(passage number, code) for every fenced code block in the passages (Markdown sources, and
    PDFs, whose monospaced text pymupdf4llm turns into fenced blocks)."""
    return [
        (i, m.group(1).strip("\n")) for i, p in enumerate(passages) for m in _CODE_BLOCK.finditer(p["text"]) if m.group(1).strip()
    ]


def related_code_passages(model: Model, concept_ids: list[str], passages: list[Row], limit: int = 2) -> list[Row]:
    """Passages with code that demonstrates this section's concepts but that no claim led to (a code
    block often shares its passage with unrelated text). Matched when the sentence introducing the
    code, or the code itself, names one of the section's concepts."""
    have = {p["id"] for p in passages}
    names = [
        n
        for cid in concept_ids
        for n in [model.concepts[cid]["name"], *(model.concepts[cid].get("aliases") or [])]
        if cid in model.concepts and len(n) >= 4
    ]
    found = []
    for chunk, context in model.code_passages():
        if chunk["id"] not in have and any(re.search(rf"(?<!\w){re.escape(n)}(?!\w)", context, re.I) for n in names):
            found.append(chunk)
    return found[:limit]


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
    blocks = code_blocks(passages)
    if blocks:
        lines += ["CODE IN THE PASSAGES:"]
        for n, code in blocks:
            lines += [f"(in P{n})", code, ""]
    if others:
        lines += ["TAUGHT ELSEWHERE IN THE BOOK (do not explain again): " + "; ".join(others)]
    return "\n".join(lines)


def write_section(services: Services, llm, model: Model, section: Row, outline: list[Row], sources: dict[str, Row]) -> dict:
    """Draft, check every paragraph against its own passages, and if any paragraph is unsupported
    rewrite the section once with that feedback. The better-supported draft is kept; paragraphs that
    are still unsupported stay, marked, never silently dropped."""
    passages = section_passages(services, model, section["concept_ids"])
    if not passages:
        raise ValueError("no passages to write from")
    passages += related_code_passages(model, section["concept_ids"], passages)
    own = set(section["concept_ids"])
    others = [model.concepts[cid]["name"] for s in outline for cid in s["concept_ids"] if cid not in own][:60]
    prompt = write_prompt(section, model, passages, sources, others)
    system = write_system(model.settings)

    draft = llm.generate_json(prompt, SectionDraft, system=system).data
    paragraphs = check_support(llm, _paragraphs(draft, passages), passages)
    problems = [p for p in paragraphs if p["support"] == "unsupported"]
    if problems:
        notes = "\n".join(f'- "{p["text"][:160]}...": {p["support_note"] or "not backed by its passages"}' for p in problems)
        retry = llm.generate_json(f"{prompt}\n\n{REWRITE_NOTE}\n{notes}", SectionDraft, system=system).data
        second = check_support(llm, _paragraphs(retry, passages), passages)
        if support_rate(second) >= support_rate(paragraphs):
            draft, paragraphs = retry, second
    known = {n.lower() for n in others}
    return {
        "paragraphs": paragraphs,
        "see_also": [n for n in dict.fromkeys(draft.see_also) if n.lower() in known][:3],
        "support_rate": support_rate(paragraphs),
        "extras": extras(draft, passages, model.settings),
    }


def extras(draft: SectionDraft, passages: list[Row], settings: dict) -> dict:
    """Code examples and process steps, filtered by the reader's settings. Code that claims to come
    from the sources must cite a passage that exists, or it is labelled illustrative."""
    code = []
    if settings["code"]:
        for example in draft.code_examples[:2]:
            body = example.code.strip("\n")
            if not body.strip():
                continue
            chunk_ids = [passages[i]["id"] for i in example.passages if 0 <= i < len(passages)]
            from_sources = bool(example.from_sources and chunk_ids)
            if not from_sources and not settings["examples"]:
                continue
            lines = body.splitlines()
            code.append(
                {
                    "language": (example.language or "text").strip().lower()[:20],
                    "caption": example.caption.strip(),
                    "code": "\n".join(lines[:40]),
                    "from_sources": from_sources,
                    "chunk_ids": chunk_ids if from_sources else [],
                }
            )
    steps = [step.strip() for step in draft.steps if step.strip()][:8]
    return {"code_examples": code, "steps_title": draft.steps_title.strip() if len(steps) >= 3 else "",
            "steps": steps if len(steps) >= 3 else []}  # fmt: skip


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
