"""Plan stage C: the outline. Gemini only ever sees concept names, kinds and links (never the
text), so this never hits a context limit.

First time:  plan chapters -> sections, each section owning concepts; then order sections so
             that prerequisites ("requires" links) come first, the LLM's order breaking ties.
Later times: only the concepts not yet in the book are *placed*, into an existing section or a
             new one. The outline never reorganises itself.

An outline here is a list of section dicts in reading order:
    {"chapter_title", "title", "concept_ids"}  (+ "id" for sections already stored)
"""

from app.book.schemas import Outline, Placement
from app.db.repository import Row

PLAN_SYSTEM = """You design the table of contents of a textbook for a student's course.
Group the numbered concepts into chapters and sections. A section teaches 1 to 5 closely related
concepts; a chapter has 2 to 6 sections. Put foundations first: a concept that another concept
requires comes earlier. Every concept goes in exactly one section. Titles are short and plain,
like a real textbook's. Use only the concepts given."""

PLACE_SYSTEM = """A textbook already has the numbered chapters [K#] and sections [S#] below.
Place each new concept [C#]: into the existing section that already teaches it or its closest
topic, or into a new section (in an existing chapter, or in a new chapter if nothing fits).
Prefer existing sections; do not reorganise the book."""


def concept_lines(concepts: list[Row], start: int = 0) -> list[str]:
    return [
        f"[C{start + i}] {c['name']} ({c.get('kind', 'term')}): {(c.get('definition') or '')[:160]}"
        for i, c in enumerate(concepts)
    ]


def link_lines(concepts: list[Row], links: list[Row]) -> list[str]:
    number = {c["id"]: i for i, c in enumerate(concepts)}
    return [
        f"[C{number[link['from_id']]}] {link['kind'].replace('_', ' ')} [C{number[link['to_id']]}]"
        for link in links
        if link["from_id"] in number and link["to_id"] in number
    ]


def plan_prompt(concepts: list[Row], links: list[Row]) -> str:
    text = "CONCEPTS:\n" + "\n".join(concept_lines(concepts))
    lines = link_lines(concepts, links)
    return text + ("\n\nLINKS:\n" + "\n".join(lines) if lines else "")


def outline_from_plan(plan: Outline, concepts: list[Row]) -> list[dict]:
    """Chapters -> section dicts. Unknown or repeated concept numbers are ignored; concepts the
    plan forgot go into a last section, so nothing is ever left out of the book."""
    used: set[int] = set()
    sections = []
    for chapter in plan.chapters:
        for section in chapter.sections:
            own = [i for i in dict.fromkeys(section.concepts) if 0 <= i < len(concepts) and i not in used]
            used.update(own)
            if own:
                sections.append(
                    {
                        "chapter_title": chapter.title.strip(),
                        "title": section.title.strip(),
                        "concept_ids": [concepts[i]["id"] for i in own],
                    }
                )
    missing = [c["id"] for i, c in enumerate(concepts) if i not in used]
    if missing:
        chapter = sections[-1]["chapter_title"] if sections else "Overview"
        sections.append({"chapter_title": chapter, "title": "More topics", "concept_ids": missing})
    return sections


def stable_order(count: int, before: dict[int, set[int]]) -> list[int]:
    """Indexes 0..count-1 ordered so that every j in before[i] comes before i; otherwise the
    original order. Cycles are broken by taking the earliest remaining index."""
    placed: list[int] = []
    remaining = list(range(count))
    while remaining:
        ready = next((i for i in remaining if before.get(i, set()) <= set(placed)), remaining[0])
        placed.append(ready)
        remaining.remove(ready)
    return placed


def order_outline(sections: list[dict], links: list[Row]) -> list[dict]:
    """Prerequisites first: chapters by the requires links between them, then sections within
    each chapter the same way. The planner's order is kept wherever the links do not decide."""
    home = {cid: i for i, s in enumerate(sections) for cid in s["concept_ids"]}
    needs: dict[int, set[int]] = {}
    for link in links:
        if link["kind"] == "requires" and link["from_id"] in home and link["to_id"] in home:
            a, b = home[link["from_id"]], home[link["to_id"]]
            if a != b:
                needs.setdefault(a, set()).add(b)

    chapters = list(dict.fromkeys(s["chapter_title"] for s in sections))
    members = {ch: [i for i, s in enumerate(sections) if s["chapter_title"] == ch] for ch in chapters}
    chapter_of = {i: chapters.index(s["chapter_title"]) for i, s in enumerate(sections)}
    chapter_needs: dict[int, set[int]] = {}
    for a, bs in needs.items():
        for b in bs:
            if chapter_of[a] != chapter_of[b]:
                chapter_needs.setdefault(chapter_of[a], set()).add(chapter_of[b])

    ordered = []
    for c in stable_order(len(chapters), chapter_needs):
        idx = members[chapters[c]]
        local = {k: {idx.index(b) for b in needs.get(i, set()) if b in idx} for k, i in enumerate(idx)}
        ordered.extend(sections[idx[k]] for k in stable_order(len(idx), local))
    return ordered


def place_prompt(sections: list[dict], new: list[Row]) -> str:
    chapters = list(dict.fromkeys(s["chapter_title"] for s in sections))
    lines = []
    for k, chapter in enumerate(chapters):
        lines.append(f"[K{k}] {chapter}")
        lines += [f"  [S{i}] {s['title']}" for i, s in enumerate(sections) if s["chapter_title"] == chapter]
    return "BOOK:\n" + "\n".join(lines) + "\n\nNEW CONCEPTS:\n" + "\n".join(concept_lines(new))


def apply_placement(sections: list[dict], new: list[Row], placement: Placement) -> list[dict]:
    """Returns the outline with the new concepts placed (new sections go at the end of their
    chapter; new chapters at the end of the book). Concepts the answer skipped get a section of
    their own at the end, titled by the concept."""
    chapters = list(dict.fromkeys(s["chapter_title"] for s in sections))
    result = [dict(s, concept_ids=list(s["concept_ids"])) for s in sections]
    originals = list(result)  # [S#] numbers refer to these, even after new sections are inserted
    placed: set[int] = set()

    def new_section(chapter_title: str, title: str) -> dict:
        existing = next(
            (s for s in result if s["chapter_title"] == chapter_title and s["title"] == title and "id" not in s), None
        )
        if existing:
            return existing
        section = {"chapter_title": chapter_title, "title": title, "concept_ids": []}
        last = max((i for i, s in enumerate(result) if s["chapter_title"] == chapter_title), default=len(result) - 1)
        result.insert(last + 1, section)
        return section

    for p in placement.placements:
        if not 0 <= p.concept < len(new) or p.concept in placed:
            continue
        concept_id = new[p.concept]["id"]
        if 0 <= p.section < len(sections):
            target = originals[p.section]
        elif 0 <= p.chapter < len(chapters):
            target = new_section(chapters[p.chapter], p.new_section_title.strip() or new[p.concept]["name"])
        else:
            chapter = p.new_chapter_title.strip() or new[p.concept]["name"]
            target = new_section(chapter, p.new_section_title.strip() or new[p.concept]["name"])
        target["concept_ids"].append(concept_id)
        placed.add(p.concept)

    for i, concept in enumerate(new):
        if i not in placed:
            chapter = result[-1]["chapter_title"] if result else "Overview"
            new_section(chapter, concept["name"])["concept_ids"].append(concept["id"])
    return result
