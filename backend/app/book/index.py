"""Section numbers ("2.3") and the back-of-book index.

The index lists every concept and alias A-Z. A concept's main entries are the sections that teach
it (own it in the outline); it also lists the sections whose text mentions it by name. An alias
points to its concept ("Lasso, see L1 regularisation"), as in a printed index.
"""

import re

from app.db.repository import Row


def section_numbers(sections: list[Row]) -> dict[str, str]:
    """Chapter and section numbers in reading order, 1-based: {section id: "2.3"}."""
    ordered = sorted(sections, key=lambda s: (s["chapter_index"], s["section_index"]))
    chapters = list(dict.fromkeys(s["chapter_index"] for s in ordered))
    numbers, counters = {}, {}
    for s in ordered:
        c = chapters.index(s["chapter_index"]) + 1
        counters[c] = counters.get(c, 0) + 1
        numbers[s["id"]] = f"{c}.{counters[c]}"
    return numbers


def _mentions(name: str, text: str) -> bool:
    return re.search(rf"(?<![\w]){re.escape(name)}(?![\w])", text, re.IGNORECASE) is not None


def _key(number: str) -> tuple[int, ...]:
    return tuple(int(n) for n in number.split("."))


def book_index(sections: list[Row], concepts: list[Row]) -> list[dict]:
    written = [s for s in sections if s.get("paragraphs")]
    numbers = section_numbers(sections)
    text = {s["id"]: " ".join(p["text"] for p in s["paragraphs"]) for s in written}
    entries = []
    for c in concepts:
        names = [c["name"], *(c.get("aliases") or [])]
        main = [s for s in written if c["id"] in s["concept_ids"]]
        mentions = [s for s in written if s not in main and any(_mentions(n, text[s["id"]]) for n in names)]
        if not main and not mentions:
            continue
        refs = [{"id": s["id"], "number": numbers[s["id"]], "title": s["title"], "main": s in main} for s in main + mentions]
        refs.sort(key=lambda r: (not r["main"], _key(r["number"])))
        entries.append({"term": c["name"], "concept_id": c["id"], "kind": c.get("kind", "term"), "sections": refs})
        for alias in c.get("aliases") or []:
            if alias.strip() and alias.strip().lower() != c["name"].lower():
                entries.append({"term": alias.strip(), "concept_id": c["id"], "see": c["name"], "sections": []})
    entries.sort(key=lambda e: e["term"].lower())
    return entries
