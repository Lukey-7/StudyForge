"""Layer 6 - context assembly: turn the chosen chunks into the text the LLM reads.

1. Walk chunks in relevance order and keep them while they fit the token budget.
2. Re-order the kept chunks by source, then page, so the LLM reads them in
   document order (easier to follow than relevance order).
3. Label each one [S1], [S2] ... and remember which label maps to which
   source file + page. The LLM cites labels; the UI turns labels into links.
"""

from dataclasses import dataclass

from app.db.repository import Row
from app.text_utils import count_tokens, snippet


@dataclass
class Citation:
    label: str
    chunk_id: str
    source_id: str
    source_name: str
    page: int | None
    heading: str | None
    snippet: str

    def to_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class AssembledContext:
    text: str
    citations: list[Citation]
    token_count: int


def assemble_context(
    chunks_in_relevance_order: list[Row],
    source_names: dict[str, str],
    token_budget: int,
) -> AssembledContext:
    kept: list[Row] = []
    used = 0
    for chunk in chunks_in_relevance_order:
        tokens = chunk.get("token_count") or count_tokens(chunk["text"])
        if used + tokens > token_budget:
            continue  # a smaller, less relevant chunk might still fit
        kept.append(chunk)
        used += tokens

    kept.sort(key=lambda c: (source_names.get(c["source_id"], ""), c.get("page") or 0, c["chunk_index"]))

    blocks: list[str] = []
    citations: list[Citation] = []
    for number, chunk in enumerate(kept, start=1):
        label = f"S{number}"
        name = source_names.get(chunk["source_id"], "source")
        where = f"{name}" + (f", p. {chunk['page']}" if chunk.get("page") else "")
        if chunk.get("heading"):
            where += f", section: {chunk['heading']}"
        blocks.append(f"[{label}] ({where})\n{chunk['text']}")
        citations.append(
            Citation(
                label, chunk["id"], chunk["source_id"], name, chunk.get("page"), chunk.get("heading"), snippet(chunk["text"])
            )
        )
    return AssembledContext(text="\n\n---\n\n".join(blocks), citations=citations, token_count=used)
