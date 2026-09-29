"""Render the mind-map JSON into Mermaid `mindmap` syntax ourselves.

Letting the LLM write Mermaid directly (as v1 did) often breaks the diagram:
one stray quote or bracket and the whole thing fails to render. Asking for
structured JSON and rendering it deterministically in code never breaks.
"""

import re

from app.generation.schemas import MindMapOutput

_UNSAFE = re.compile(r"[()\[\]{}\"'`<>#;:]")


def clean_label(label: str) -> str:
    return " ".join(_UNSAFE.sub(" ", label).split())[:60] or "..."


def to_mermaid(mind_map: MindMapOutput) -> str:
    lines = ["mindmap", f"  root(({clean_label(mind_map.root)}))"]
    for branch in mind_map.branches:
        lines.append(f"    {clean_label(branch.label)}")
        for child in branch.children:
            lines.append(f"      {clean_label(child)}")
    return "\n".join(lines)
