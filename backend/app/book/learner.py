"""Plan phase 5: the learner in the loop.

- explain a section differently (simpler, or step by step), from the section's own passages;
- "ask the book": chat also retrieves the most relevant book sections and cites them as [B#];
- search across all of a user's notebooks (concepts and book sections).
The read marks and chapter quiz scores live in book_reads (api/book.py).
"""

import re
from collections import Counter

from app.db.repository import Row
from app.services import Services

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
    """Word overlap, with the section's concept names counting double. Enough to pick 2 sections."""
    have = Counter(words(text)) + Counter(words(boost) * 2)
    return sum(min(have[w], 3) for w in set(query))


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
    ranked = sorted(
        sections,
        key=lambda s: (
            -score(query, " ".join(p["text"] for p in s["paragraphs"]), " ".join(names.get(c, "") for c in s["concept_ids"]))
        ),
    )
    chosen = [s for s in ranked[:top] if score(query, s["title"] + " " + " ".join(p["text"] for p in s["paragraphs"])) > 0]
    if not chosen:
        return "", []
    first_chunks = [next((c for p in s["paragraphs"] for c in p.get("chunk_ids", [])), None) for s in chosen]
    chunks = {c["id"]: c for c in repo.get_chunks([c for c in first_chunks if c])}
    blocks, citations = [], []
    for i, (s, chunk_id) in enumerate(zip(chosen, first_chunks), start=first_label):
        label = f"B{i}"
        text = " ".join(p["text"] for p in s["paragraphs"])
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
    """Concepts and book sections matching the query across every notebook the user owns."""
    query = words(q)
    if not query:
        return []
    repo, results = services.repo, []
    for notebook in repo.list_notebooks(user_id):
        nb = {"id": notebook["id"], "title": notebook["title"]}
        for c in repo.select("concepts", notebook_id=notebook["id"]):
            s = score(query, c["definition"], " ".join([c["name"], *(c.get("aliases") or [])]))
            if s:
                results.append(
                    {
                        "kind": "concept",
                        "score": s + 1,
                        "notebook": nb,
                        "id": c["id"],
                        "title": c["name"],
                        "snippet": c["definition"],
                    }
                )
        for sec in repo.select("book_sections", notebook_id=notebook["id"]):
            text = " ".join(p["text"] for p in sec.get("paragraphs") or [])
            s = score(query, text, sec["title"])
            if s:
                results.append(
                    {"kind": "section", "score": s, "notebook": nb, "id": sec["id"], "title": sec["title"], "snippet": text[:200]}
                )
    results.sort(key=lambda r: -r["score"])
    return results[:limit]
