"""Build the knowledge model for one source (plan stages A and B).

For each batch of the source's passages:
  1. EXTRACT  Gemini reads the passages and returns concepts, claims and links (structured JSON).
  2. CONCEPTS each concept is matched to an existing one (same name/alias, or embeddings close
              enough) or created. Thirty sources defining "normalisation" -> one concept.
  3. CLAIMS   each claim is compared with the nearest existing claim of the same concept; if they
              are close, one short LLM call judges the pairs:
                same        -> duplicate: the existing claim gains this passage as evidence
                contradicts -> conflict: the existing claim stays, the disagreement is recorded
                otherwise   -> a new claim with its evidence.
Runs in the background after ingestion. Re-running for a source first removes what it
contributed, so it is idempotent.
"""

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field

from app.db.repository import Row
from app.knowledge.schemas import ExtractedClaim, Extraction, Verdicts
from app.knowledge.triage import decide_claim, is_same_concept, match_concept, normalise
from app.llm.counting import CountingLLM
from app.services import Services

logger = logging.getLogger(__name__)

NEIGHBOURS = 3  # existing claims each new claim is compared with

EXTRACT_SYSTEM = """You build the knowledge map of a student's course notes.
From the numbered passages, return:
- concepts: glossary-worthy terms AND named examples (algorithms, systems, people, worked examples
  the passages name). Canonical name, kind, one-sentence definition from the passages, aliases.
- claims: atomic, self-contained factual statements, each about one of the concepts, with the
  number of the passage it comes from. Rephrase pronouns into the concept's name.
- links: requires / part_of / contrasts_with between the concepts.
- events: only dates the passages state (a year at least), with what happened, for a timeline.
- tables: only tables of numbers that appear in the passages, copied cell by cell, for a chart.
Use only the passages. No outside knowledge. Skip trivia and page furniture."""

VERIFY_SYSTEM = """For each numbered pair of statements, answer:
- same: they state the same fact (wording may differ);
- contradicts: they make incompatible statements about the same thing;
- unrelated: they are about different aspects, or one adds new information.
Judge only what the statements say."""

SAME_CONCEPT_SYSTEM = """Each numbered pair gives two glossary entries (name: definition). Answer:
- same: both entries name the same concept (synonyms, abbreviations, singular/plural);
- contradicts: the same concept, but the definitions disagree;
- unrelated: different concepts, even if closely related (a part of, a kind of, a remedy for)."""


def concept_text(concept: Row) -> str:
    return f"{concept['name']}: {concept['definition']}"


class PassageBudget:
    """Free-tier guard: at most `per_hour` passages extracted per hour (sliding window, in process).
    A job that would exceed it waits as 'queued' until the user rebuilds later."""

    def __init__(self, per_hour: int) -> None:
        self.per_hour = per_hour
        self._used: deque[tuple[float, int]] = deque()
        self._lock = threading.Lock()

    def can_take(self, passages: int) -> bool:
        """Whether take(passages) would succeed now (without taking)."""
        with self._lock:
            now = time.monotonic()
            used = sum(n for t, n in self._used if now - t <= 3600)
            return not used or used + passages <= self.per_hour

    def take(self, passages: int) -> bool:
        with self._lock:
            now = time.monotonic()
            while self._used and now - self._used[0][0] > 3600:
                self._used.popleft()
            used = sum(n for _, n in self._used)
            if used and used + passages > self.per_hour:  # a first job always runs, however big
                return False
            self._used.append((now, passages))
            return True


_budget: PassageBudget | None = None


def budget_for(services: Services) -> PassageBudget:
    global _budget
    if _budget is None or _budget.per_hour != services.settings.knowledge_max_passages_per_hour:
        _budget = PassageBudget(services.settings.knowledge_max_passages_per_hour)
    return _budget


@dataclass
class NotebookState:
    """What we already know about the notebook, loaded once per build."""

    known: dict[str, str] = field(default_factory=dict)  # normalised name/alias -> concept id
    concepts: dict[str, Row] = field(default_factory=dict)
    claim_text: dict[str, str] = field(default_factory=dict)
    links: set[tuple[str, str, str]] = field(default_factory=set)
    evidence: set[tuple[str, str]] = field(default_factory=set)  # (claim_id, chunk_id)
    llm: CountingLLM | None = None  # the job's LLM, counting its calls

    @classmethod
    def load(cls, services: Services, notebook_id: str) -> "NotebookState":
        repo = services.repo
        state = cls()
        for concept in repo.select("concepts", notebook_id=notebook_id):
            state.add_concept(concept)
        state.claim_text = {c["id"]: c["text"] for c in repo.select("claims", notebook_id=notebook_id)}
        state.links = {
            (link["from_id"], link["to_id"], link["kind"]) for link in repo.select("concept_links", notebook_id=notebook_id)
        }
        state.evidence = {(e["claim_id"], e["chunk_id"]) for e in repo.select("claim_evidence", notebook_id=notebook_id)}
        return state

    def add_concept(self, concept: Row) -> None:
        self.concepts[concept["id"]] = concept
        for name in [concept["name"], *(concept.get("aliases") or [])]:
            self.known.setdefault(normalise(name), concept["id"])


def batches(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def extraction_prompt(passages: list[Row]) -> str:
    blocks = [
        f"[P{i}]" + (f" (section: {p['heading']})" if p.get("heading") else "") + f"\n{p['text']}" for i, p in enumerate(passages)
    ]
    return "PASSAGES:\n\n" + "\n\n".join(blocks)


def verify_prompt(pairs: list[tuple[str, str]]) -> str:
    return "\n\n".join(f"Pair {i}:\nA: {a}\nB: {b}" for i, (a, b) in enumerate(pairs))


# --------------------------------------------------------------------------- entry points
_notebook_locks: dict[str, threading.Lock] = {}
_notebook_locks_guard = threading.Lock()


def notebook_lock(notebook_id: str) -> threading.Lock:
    """One knowledge change at a time per notebook. Sources that finish together would otherwise
    build in parallel from stale snapshots: one build's clean-up could delete another's brand-new
    concepts (not yet given claims), and two builds could create the same concept twice."""
    with _notebook_locks_guard:
        return _notebook_locks.setdefault(notebook_id, threading.Lock())


def build_for_source(services: Services, source_id: str) -> None:
    source = services.repo.get_source(source_id)
    if source is None or source["status"] != "ready":
        return
    with notebook_lock(source["notebook_id"]):
        _build_for_source(services, source_id)


def _build_for_source(services: Services, source_id: str) -> None:
    repo = services.repo
    source = repo.get_source(source_id)  # re-read: it may have changed while waiting for the lock
    if source is None or source["status"] != "ready":
        return
    notebook_id = source["notebook_id"]
    remove_source_knowledge(services, source, keep_concepts=True)
    job = repo.insert("knowledge_jobs", {"notebook_id": notebook_id, "source_id": source_id, "status": "running", "progress": 0})
    try:
        llm, embedder = services.require_ai()
        passages = repo.list_chunks(notebook_id, [source_id])
        if not budget_for(services).take(len(passages)):
            repo.update(
                "knowledge_jobs",
                job["id"],
                {"status": "queued", "detail": "Waiting for the hourly free-tier budget. Use Rebuild later."},
            )
            return
        state = NotebookState.load(services, notebook_id)
        state.llm = llm = CountingLLM(llm)
        groups = batches(passages, services.settings.knowledge_batch_passages)
        for number, group in enumerate(groups, start=1):
            extraction = llm.generate_json(extraction_prompt(group), Extraction, system=EXTRACT_SYSTEM, fast=True).data
            apply_extraction(services, source, group, extraction, state)
            repo.update("knowledge_jobs", job["id"], {"progress": int(100 * number / len(groups)), "llm_calls": llm.calls})
        orphans = prune_concepts(services, notebook_id)  # concepts this source no longer supports
        services.vectors.delete_ids(embedder.active_model, orphans, "concepts")
        repo.update(
            "knowledge_jobs",
            job["id"],
            {"status": "done", "progress": 100, "llm_calls": llm.calls, "detail": f"{len(passages)} passages read"},
        )
        logger.info(
            "knowledge built for %s: %d passages, %d concepts in notebook",
            source["file_name"],
            len(passages),
            len(state.concepts),
        )
    except Exception as exc:  # noqa: BLE001 - never breaks ingestion; shown on the Book tab
        logger.exception("knowledge build failed for %s", source_id)
        repo.update("knowledge_jobs", job["id"], {"status": "failed", "detail": str(exc)[:300]})


def remove_source_knowledge(services: Services, source: Row, keep_concepts: bool = False) -> None:
    """Undo what a source contributed: its evidence and conflicts, then any claim or concept that
    no longer has evidence from any source. A rebuild keeps the concepts (keep_concepts) so that
    re-reading the source finds them again by name: concept ids, and so the book's outline, stay
    the same. prune_concepts() removes the ones still unsupported afterwards."""
    repo, notebook_id = services.repo, source["notebook_id"]
    for table in ("claim_evidence", "conflicts", "knowledge_jobs", "timeline_events", "data_tables"):
        repo.delete(table, source_id=source["id"])

    supported = {e["claim_id"] for e in repo.select("claim_evidence", notebook_id=notebook_id)}
    claims = repo.select("claims", notebook_id=notebook_id)
    orphan_claims = [c["id"] for c in claims if c["id"] not in supported]
    for claim_id in orphan_claims:
        repo.delete("claims", id=claim_id)

    orphan_concepts = [] if keep_concepts else prune_concepts(services, notebook_id)

    # a concept stays "conflicted" only while it still has a conflict
    disputed = {c["claim_id"] for c in repo.select("conflicts", notebook_id=notebook_id)}
    disputed_concepts = {c["concept_id"] for c in claims if c["id"] in disputed}
    for concept in repo.select("concepts", notebook_id=notebook_id, status="conflicted"):
        if concept["id"] not in disputed_concepts:
            repo.update("concepts", concept["id"], {"status": "current"})

    if services.embedder is not None:
        model = services.embedder.active_model
        services.vectors.delete_ids(model, orphan_claims, "claims")
        services.vectors.delete_ids(model, orphan_concepts, "concepts")


def prune_concepts(services: Services, notebook_id: str) -> list[str]:
    """Deletes concepts that no claim supports any more; returns their ids."""
    repo = services.repo
    used = {c["concept_id"] for c in repo.select("claims", notebook_id=notebook_id)}
    orphans = [c["id"] for c in repo.select("concepts", notebook_id=notebook_id) if c["id"] not in used]
    for concept_id in orphans:
        repo.delete("concepts", id=concept_id)
    return orphans


# --------------------------------------------------------------------------- merging one batch
def apply_extraction(services: Services, source: Row, passages: list[Row], extraction: Extraction, state: NotebookState) -> None:
    ids = resolve_concepts(services, source, extraction, state)

    def concept_id(name: str) -> str | None:
        return ids.get(normalise(name)) or state.known.get(normalise(name))

    for link in extraction.links:
        a, b = concept_id(link.from_concept), concept_id(link.to_concept)
        if a and b and a != b and (a, b, link.kind) not in state.links:
            services.repo.insert(
                "concept_links", {"notebook_id": source["notebook_id"], "from_id": a, "to_id": b, "kind": link.kind}
            )
            state.links.add((a, b, link.kind))

    add_events_and_tables(services, source, passages, extraction, concept_id)

    claims = [(c, concept_id(c.concept)) for c in extraction.claims if 0 <= c.passage < len(passages)]
    # A concept the extractor named but made no claim about still has its definition as evidence;
    # without it the concept would show no source and vanish on the next rebuild.
    covered = {cid for _, cid in claims}
    for concept in extraction.concepts:
        cid = concept_id(concept.name)
        if cid and cid not in covered and concept.definition.strip() and 0 <= concept.passage < len(passages):
            text = f"{concept.name.strip()}: {concept.definition.strip()}"
            claims.append((ExtractedClaim(concept=concept.name, text=text, passage=concept.passage), cid))
            covered.add(cid)
    triage_claims(services, source, passages, [(c, cid) for c, cid in claims if cid], state)


def resolve_concepts(services: Services, source: Row, extraction: Extraction, state: NotebookState) -> dict[str, str]:
    """Returns normalised extracted name -> concept id, creating concepts only when nothing matches."""
    repo, notebook_id = services.repo, source["notebook_id"]
    resolved: dict[str, str] = {}
    unmatched = []
    for concept in extraction.concepts:
        existing = match_concept(concept.name, concept.aliases, state.known)
        if existing:
            resolved[normalise(concept.name)] = existing
            add_aliases(services, state, existing, [concept.name, *concept.aliases])
        else:
            unmatched.append(concept)
    if not unmatched:
        return resolved

    embedder = services.embedder
    vectors = embedder.embed_documents([f"{c.name}: {c.definition}" for c in unmatched])
    model = embedder.active_model

    # Embeddings only shortlist: "Deadlock prevention" sits close to "Coffman conditions" without
    # being the same thing. One LLM call judges every near-match of this batch.
    near: dict[int, str] = {}
    for i, vector in enumerate(vectors):
        hits = services.vectors.query(model, vector, 1, {"notebook_id": notebook_id}, kind="concepts")
        if hits and hits[0][0] in state.concepts and is_same_concept(hits[0][1], services.settings.concept_merge_similarity):
            near[i] = hits[0][0]
    same: set[int] = set()
    if near:
        keys = list(near)
        pairs = [(concept_text(state.concepts[near[i]]), f"{unmatched[i].name}: {unmatched[i].definition}") for i in keys]
        result = state.llm.generate_json(verify_prompt(pairs), Verdicts, system=SAME_CONCEPT_SYSTEM, fast=True).data
        same = {keys[v.pair] for v in result.verdicts if 0 <= v.pair < len(keys) and v.verdict != "unrelated"}

    for i, (concept, vector) in enumerate(zip(unmatched, vectors)):
        existing = match_concept(concept.name, concept.aliases, state.known)  # created earlier in this batch
        if existing or i in same:
            concept_id = existing or near[i]
            add_aliases(services, state, concept_id, [concept.name, *concept.aliases])
        else:
            row = repo.insert(
                "concepts",
                {
                    "notebook_id": notebook_id,
                    "user_id": source["user_id"],
                    "name": concept.name.strip(),
                    "kind": concept.kind,
                    "definition": concept.definition.strip(),
                    "aliases": sorted(
                        {a.strip() for a in concept.aliases if a.strip() and normalise(a) != normalise(concept.name)}
                    ),
                    "status": "current",
                },
            )
            services.vectors.upsert(model, [row["id"]], [vector], [{"notebook_id": notebook_id}], kind="concepts")
            state.add_concept(row)
            concept_id = row["id"]
        resolved[normalise(concept.name)] = concept_id
    return resolved


def add_aliases(services: Services, state: NotebookState, concept_id: str, names: list[str]) -> None:
    concept = state.concepts[concept_id]
    current = {normalise(concept["name"]), *(normalise(a) for a in concept.get("aliases") or [])}
    new = [n.strip() for n in names if n.strip() and normalise(n) not in current]
    if new:
        updated = services.repo.update("concepts", concept_id, {"aliases": sorted({*(concept.get("aliases") or []), *new})})
        state.add_concept(updated)


def triage_claims(services: Services, source: Row, passages: list[Row], claims: list, state: NotebookState) -> None:
    if not claims:
        return
    repo, notebook_id, cfg = services.repo, source["notebook_id"], services.settings
    embedder = services.embedder
    vectors = embedder.embed_documents([c.text for c, _ in claims])
    model = embedder.active_model

    # The nearest existing claims of the same concept (up to NEIGHBOURS), for each new claim.
    nearest: list[list[tuple[str, float]]] = []
    for (_, concept_id), vector in zip(claims, vectors):
        where = {"$and": [{"notebook_id": notebook_id}, {"concept_id": concept_id}]}
        hits = services.vectors.query(model, vector, NEIGHBOURS, where, kind="claims")
        nearest.append([(cid, sim) for cid, sim in hits if cid in state.claim_text and sim >= cfg.claim_compare_similarity])

    # One LLM call judges every (existing, new) pair that is close enough to be worth comparing.
    pair_keys = [(i, cid) for i, hits in enumerate(nearest) for cid, _ in hits]
    verdicts: dict[tuple[int, str], str] = {}
    if pair_keys:
        pairs = [(state.claim_text[cid], claims[i][0].text) for i, cid in pair_keys]
        result = state.llm.generate_json(verify_prompt(pairs), Verdicts, system=VERIFY_SYSTEM, fast=True).data
        for v in result.verdicts:
            if 0 <= v.pair < len(pair_keys):
                verdicts[pair_keys[v.pair]] = v.verdict

    for i, ((claim, concept_id), vector) in enumerate(zip(claims, vectors)):
        passage = passages[claim.passage]
        where_from = {
            "notebook_id": notebook_id,
            "chunk_id": passage["id"],
            "source_id": source["id"],
            "page": passage.get("page"),
        }
        candidates = [(cid, sim, verdicts.get((i, cid))) for cid, sim in nearest[i]]
        decision, existing_id = decide_claim(candidates, cfg.claim_compare_similarity)
        if decision == "duplicate":
            add_evidence(repo, state, existing_id, where_from)
        elif decision == "conflict":
            repo.insert("conflicts", {**where_from, "claim_id": existing_id, "contradicting_text": claim.text})
            repo.update("concepts", concept_id, {"status": "conflicted"})
        else:
            row = repo.insert("claims", {"notebook_id": notebook_id, "concept_id": concept_id, "text": claim.text.strip()})
            state.claim_text[row["id"]] = row["text"]
            add_evidence(repo, state, row["id"], where_from)
            services.vectors.upsert(
                model, [row["id"]], [vector], [{"notebook_id": notebook_id, "concept_id": concept_id}], kind="claims"
            )


def add_evidence(repo, state: NotebookState, claim_id: str, where_from: dict) -> None:
    key = (claim_id, where_from["chunk_id"])
    if key not in state.evidence:  # the same passage never counts twice for one claim
        repo.insert("claim_evidence", {**where_from, "claim_id": claim_id})
        state.evidence.add(key)


def add_events_and_tables(services: Services, source: Row, passages: list[Row], extraction: Extraction, concept_id) -> None:
    """Dated events (timelines) and numeric tables (charts), each tied to its passage. Stored as
    stated: figures are drawn from them by code, never by the LLM."""
    repo = services.repo
    for e in extraction.events:
        cid = concept_id(e.concept)
        if cid and 0 <= e.passage < len(passages) and e.event.strip() and 0 < e.year < 3000:
            where = {"notebook_id": source["notebook_id"], "source_id": source["id"], "chunk_id": passages[e.passage]["id"]}
            repo.insert(
                "timeline_events",
                {**where, "concept_id": cid, "date_text": e.date.strip(), "year": e.year, "event": e.event.strip()},
            )
    for t in extraction.tables:
        cid = concept_id(t.concept)
        rows = [r for r in t.rows if len(r) == len(t.columns)]
        if cid and 0 <= t.passage < len(passages) and len(t.columns) >= 2 and len(rows) >= 2:
            where = {"notebook_id": source["notebook_id"], "source_id": source["id"], "chunk_id": passages[t.passage]["id"]}
            repo.insert("data_tables", {**where, "concept_id": cid, "title": t.title.strip(), "columns": t.columns, "rows": rows})


# --------------------------------------------------------------------------- queued builds resume
def resume_queued(services: Services) -> int:
    """Re-runs the knowledge builds that are waiting for the hourly budget (a long document, or many
    sources at once), then updates their books. Returns how many builds it started."""
    from app.book.sync import after_knowledge_change

    latest: dict[str, Row] = {}
    for job in services.repo.select("knowledge_jobs", status="queued"):
        if job.get("source_id") and job.get("kind", "extract") == "extract":
            latest[job["source_id"]] = job
    started = 0
    for source_id, job in latest.items():
        passages = len(services.repo.list_chunks(job["notebook_id"], [source_id]))
        if not budget_for(services).can_take(passages):
            continue
        build_for_source(services, source_id)
        after_knowledge_change(services, job["notebook_id"])
        started += 1
    return started


def resume_waiting_sections(services: Services) -> int:
    """Finishes books whose sections were left stale (waiting for the daily writing cap)."""
    from app.book.sync import after_knowledge_change

    try:
        notebooks = {row["notebook_id"] for row in services.repo.select("book_sections", status="stale")}
    except Exception:  # noqa: BLE001 - book tables not migrated yet
        return 0
    for notebook_id in notebooks:
        after_knowledge_change(services, notebook_id)
    return len(notebooks)


def start_resumer(services: Services, every_seconds: int = 300) -> None:
    """A daemon thread that calls resume_queued every few minutes (not in tests)."""
    if not services.settings.resume_queued_builds or services.settings.app_env == "test" or services.embedder is None:
        return

    def loop() -> None:
        while True:
            time.sleep(every_seconds)
            try:
                if resume_queued(services):
                    logger.info("resumed queued knowledge builds")
                if resume_waiting_sections(services):
                    logger.info("resumed books with sections waiting to be written")
            except Exception:  # noqa: BLE001 - try again next round
                logger.exception("resuming queued knowledge builds failed")

    threading.Thread(target=loop, name="knowledge-resumer", daemon=True).start()
