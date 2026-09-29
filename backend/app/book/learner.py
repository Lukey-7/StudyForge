"""Plan phase 5: the learner in the loop.

- explain a section differently (simpler, or step by step), from the section's own passages;
- "ask the book": chat also retrieves the most relevant book sections and cites them as [B#];
- search across all of a user's notebooks (concepts and book sections).
Both rank by meaning: the similarity of the query's embedding to the embedded sections ("sections"
collection, see book/sync.py::index_sections) and concepts ("concepts" collection), plus a small
bonus for exact word matches so an exact term still wins. Without embeddings they fall back to words.
The read marks and chapter quiz scores live in book_reads (api/book.py).
"""

import logging
import re
from collections import Counter

from app.db.repository import Row
from app.services import Services

logger = logging.getLogger(__name__)
WORD_BONUS = 0.05  # per matching query word (capped), added to the cosine similarity

STYLES = {
    "simpler": "Explain it again for a student meeting it for the first time: short sentences, plain words, "
    "one idea at a time. Define every term you use.",
    "steps": "Explain it again as a numbered sequence of steps or ideas that build on each other, "
    "ending with one sentence that ties them together.",
}

EXPLAIN_SYSTEM = """You re-explain one section of a student's textbook. Use only the facts in the SECTION
and PASSAGES given; never add outside facts. Plain text or a short numbered list, no headings."""

_WORD = re.compile(r"[a-z0-9+]+")
STOP = set(
    "a an the of to in on for and or is are was were be by with as at what how why which does do it its this that from".split()
)


def words(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in STOP and len(w) > 1]


def explain_section(services: Services, section: Row, style: str) -> dict:
    chunk_ids = list(dict.fromkeys(c for p in section["paragraphs"] for c in p.get("chunk_ids", [])))
    passages = services.repo.get_chunks(chunk_ids)
    prompt = "\n".join(
        [
            f"SECTION: {section['title']}",
            *[p["text"] for p in section["paragraphs"]],
            "",
            "PASSAGES:",
            *[p["text"] for p in passages],
            "",
            f"TASK: {STYLES[style]}",
        ]
    )
    return {"style": style, "text": services.llm.generate_text(prompt, system=EXPLAIN_SYSTEM, fast=True).text.strip()}


def score(query: list[str], text: str, boost: str = "") -> float:
    """Word overlap, with concept names / titles counting double."""
    have = Counter(words(text)) + Counter(words(boost) * 2)
    return sum(min(have[w], 3) for w in set(query))


def similarities(services: Services, notebook_ids: list[str], vector: list[float] | None, kind: str, k: int) -> dict[str, float]:
    """Cosine similarity of the query to the k nearest items of a collection in these notebooks."""
    if vector is None or not notebook_ids:
        return {}
    where = {"notebook_id": notebook_ids[0]} if len(notebook_ids) == 1 else {"notebook_id": {"$in": notebook_ids}}
    try:
        return dict(services.vectors.query(services.embedder.active_model, vector, k, where, kind=kind))
    except Exception:  # noqa: BLE001 - e.g. nothing indexed yet: words still work
        logger.exception("semantic lookup in %s failed", kind)
        return {}


def query_vector(services: Services, text: str) -> list[float] | None:
    if services.embedder is None:
        return None
    try:
        return services.embedder.embed_query(text)
    except Exception:  # noqa: BLE001
        logger.exception("could not embed the query")
        return None


def rank(sim: float | None, word_score: float, min_similarity: float) -> float | None:
    """Combined score, or None when the item matches neither by meaning nor by words."""
    if (sim is None or sim < min_similarity) and word_score == 0:
        return None
    return (sim or 0.0) + WORD_BONUS * min(word_score, 6)


def section_text(s: Row) -> str:
    return " ".join(p["text"] for p in s.get("paragraphs") or [])


def book_context(
    services: Services, notebook_id: str, question: str, first_label: int = 1, top: int = 2
) -> tuple[str, list[dict]]:
    """The book sections most relevant to a chat question, labelled [B1], [B2] for citation. Each
    citation opens the passage behind the section's first cited paragraph."""
    repo = services.repo
    sections = [s for s in repo.select("book_sections", notebook_id=notebook_id) if s.get("paragraphs")]
    if not sections:
        return "", []
    names = {c["id"]: c["name"] for c in repo.select("concepts", notebook_id=notebook_id)}
    query = words(question)
    sims = similarities(services, [notebook_id], query_vector(services, question), "sections", top * 3)
    floor = services.settings.book_search_min_similarity
    scored = []
    for s in sections:
        words_score = score(query, s["title"] + " " + section_text(s), " ".join(names.get(c, "") for c in s["concept_ids"]))
        value = rank(sims.get(s["id"]), words_score, floor)
        if value is not None:
            scored.append((value, s))
    chosen = [s for _, s in sorted(scored, key=lambda x: -x[0])[:top]]
    if not chosen:
        return "", []
    first_chunks = [next((c for p in s["paragraphs"] for c in p.get("chunk_ids", [])), None) for s in chosen]
    chunks = {c["id"]: c for c in repo.get_chunks([c for c in first_chunks if c])}
    blocks, citations = [], []
    for i, (s, chunk_id) in enumerate(zip(chosen, first_chunks), start=first_label):
        label = f"B{i}"
        text = section_text(s)
        blocks.append(f'[{label}] Book section "{s["title"]}"\n{text}')
        chunk = chunks.get(chunk_id or "", {})
        citations.append(
            {
                "label": label,
                "kind": "book",
                "section_id": s["id"],
                "chunk_id": chunk_id,
                "source_id": chunk.get("source_id"),
                "source_name": f"Book: {s['title']}",
                "page": None,
                "heading": s["title"],
                "snippet": text[:240],
            }
        )
    return "\n\n".join(blocks), citations


def search(services: Services, user_id: str, q: str, limit: int = 20) -> list[dict]:
    """Concepts and book sections matching the query, by meaning and by words, across every
    notebook the user owns (never anyone else's: the notebook ids come from the user)."""
    repo = services.repo
    notebooks = {n["id"]: {"id": n["id"], "title": n["title"]} for n in repo.list_notebooks(user_id)}
    query = words(q)
    vector = query_vector(services, q)
    if not notebooks or (not query and vector is None):
        return []
    ids, floor = list(notebooks), services.settings.book_search_min_similarity
    concept_sims = similarities(services, ids, vector, "concepts", limit)
    section_sims = similarities(services, ids, vector, "sections", limit)
    results = []

    def add(kind: str, row: Row, nb: dict, title: str, snippet: str, value: float | None) -> None:
        if value is not None:
            results.append({"kind": kind, "score": value, "notebook": nb, "id": row["id"], "title": title, "snippet": snippet})

    for nid, nb in notebooks.items():
        for c in repo.select("concepts", notebook_id=nid):
            names = " ".join([c["name"], *(c.get("aliases") or [])])
            value = rank(concept_sims.get(c["id"]), score(query, c["definition"], names), floor)
            add("concept", c, nb, c["name"], c["definition"], value)
        for sec in repo.select("book_sections", notebook_id=nid):
            text = section_text(sec)
            value = rank(section_sims.get(sec["id"]), score(query, text, sec["title"]), floor)
            add("section", sec, nb, sec["title"], text[:200], value)
    results.sort(key=lambda r: -r["score"])
    return results[:limit]
