"""Plan stage F: figures, rendered by code from the knowledge model, never drawn by an LLM.

- concept map per chapter: a Mermaid flowchart of the chapter's concepts and the links between them;
- comparison tables: for each "contrasts with" link in a section, the two concepts side by side
  (definition + their best-supported claims).
Timelines and charts need dated claims / numeric tables that extraction does not capture yet.
"""

import re

from app.db.repository import Row

EDGE_LABEL = {"requires": "requires", "part_of": "part of", "contrasts_with": "contrasts with"}


def _label(text: str) -> str:
    """Mermaid-safe node text: quotes and brackets would end the label."""
    return re.sub(r'["\[\]{}()<>|#;]', " ", text).strip()[:60]


def chapter_map(concept_ids: list[str], concepts: dict[str, Row], links: list[Row]) -> str | None:
    """Mermaid source for one chapter, or None when the chapter has no links to draw."""
    own = [cid for cid in dict.fromkeys(concept_ids) if cid in concepts]
    node = {cid: f"c{i}" for i, cid in enumerate(own)}
    edges = [
        (node[link["from_id"]], EDGE_LABEL[link["kind"]], node[link["to_id"]])
        for link in links
        if link["from_id"] in node and link["to_id"] in node and link["kind"] in EDGE_LABEL
    ]
    if not edges:
        return None
    linked = {n for a, _, b in edges for n in (a, b)}
    lines = ["flowchart TD"]  # top-down: fits a reading column better than left-right
    lines += [f'  {node[cid]}["{_label(concepts[cid]["name"])}"]' for cid in own if node[cid] in linked]
    lines += [f"  {a} -->|{label}| {b}" for a, label, b in dict.fromkeys(edges)]
    return "\n".join(lines)


def comparisons(
    concept_ids: list[str], concepts: dict[str, Row], links: list[Row], claims_of: dict[str, list[str]]
) -> list[dict]:
    """Side-by-side tables for the section's "contrasts with" pairs (at least one side in the section)."""
    own = set(concept_ids)
    seen, tables = set(), []
    for link in links:
        a, b = link["from_id"], link["to_id"]
        if link["kind"] != "contrasts_with" or not ({a, b} & own) or a not in concepts or b not in concepts:
            continue
        key = frozenset((a, b))
        if key in seen:
            continue
        seen.add(key)
        tables.append(
            {
                "columns": [
                    {
                        "id": cid,
                        "name": concepts[cid]["name"],
                        "definition": concepts[cid]["definition"],
                        "facts": claims_of.get(cid, [])[:3],
                    }
                    for cid in (a, b)
                ]
            }
        )
    return tables
