"""Step 2 of ingestion: pages of text -> overlapping chunks (~600 tokens, 15% overlap).

Algorithm (a "recursive" splitter, like LangChain's, written out by hand):
  1. Break the text into small UNITS, trying the most natural boundary first:
     paragraph (blank line) -> line -> sentence (". ") -> word (" ").
     A piece is only split further if it is still bigger than the max chunk size.
  2. Walk the units and GREEDILY pack them into a chunk until adding the next
     unit would exceed the target size. Then start a new chunk that begins with
     the last ~15% of the previous one (the overlap), so a sentence that sits on
     a boundary is fully present in at least one chunk.
  3. Every unit remembers its page number and the latest section heading, so
     every chunk can later be cited as "source.pdf, p. 4, section 2.1".
"""

import re
from dataclasses import dataclass

from app.ingest.extract import ExtractedPage
from app.text_utils import count_tokens

SENTENCE_AND_WORD_SEPARATORS = [". ", " "]

# "2.1 Indexing", "3. Results", "IV. Methods", "Chapter 2 ..." -- but not "2019 was a year".
_NUMBERED_HEADING = re.compile(r"^((\d+(\.\d+)+|\d+\.)\s+[A-Za-z]|[IVXLC]+\.\s+[A-Za-z]|(chapter|section|unit|part)\s+\w)", re.I)


@dataclass
class Unit:
    text: str
    page: int | None
    heading: str | None
    starts_paragraph: bool
    tokens: int


@dataclass
class Chunk:
    chunk_index: int
    text: str
    page: int | None
    page_end: int | None
    heading: str | None
    token_count: int


def detect_heading(line: str) -> str | None:
    """Cheap heuristic: markdown '#', numbered ('2.1 Indexing'), ALL CAPS or Title Case short lines."""
    line = line.strip()
    if line.startswith("#"):
        return line.lstrip("#").strip() or None
    words = line.split()
    if not words or len(words) > 12 or len(line) > 90 or line.endswith((".", ",", ";", ":", "?")):
        return None
    if _NUMBERED_HEADING.match(line):
        return line
    letters = [c for c in line if c.isalpha()]
    if len(letters) >= 4 and (line.isupper() or (line.istitle() and len(words) >= 2)):
        return line
    return None


def split_to_fit(text: str, max_tokens: int, separators: list[str]) -> list[str]:
    """Recursively split `text` until every piece is <= max_tokens."""
    if count_tokens(text) <= max_tokens:
        return [text]
    if not separators:
        step = max_tokens * 4  # hard cut by characters (~4 chars per token)
        return [text[i : i + step] for i in range(0, len(text), step)]
    separator, rest = separators[0], separators[1:]
    parts = [p for p in text.split(separator) if p.strip()]
    if len(parts) == 1:
        return split_to_fit(text, max_tokens, rest)
    pieces: list[str] = []
    for i, part in enumerate(parts):
        # keep the '.' that the ". " split removed
        if separator == ". " and i < len(parts) - 1:
            part += "."
        pieces.extend(split_to_fit(part.strip(), max_tokens, rest))
    return pieces


def to_units(pages: list[ExtractedPage], max_tokens: int) -> list[Unit]:
    units: list[Unit] = []
    heading: str | None = None
    for page in pages:
        new_paragraph = True
        for raw_line in page.text.splitlines():
            line = raw_line.strip()
            if not line:
                new_paragraph = True
                continue
            found = detect_heading(line)
            if found:
                heading = found
                new_paragraph = True
            for i, piece in enumerate(split_to_fit(line, max_tokens, SENTENCE_AND_WORD_SEPARATORS)):
                units.append(Unit(piece, page.page, heading, new_paragraph and i == 0, count_tokens(piece)))
            new_paragraph = bool(found)
    return units


def _join(units: list[Unit]) -> str:
    out = ""
    for unit in units:
        if not out:
            out = unit.text
        else:
            out += ("\n\n" if unit.starts_paragraph else "\n") + unit.text
    return out


def _make_chunk(index: int, units: list[Unit]) -> Chunk:
    text = _join(units)
    pages = [u.page for u in units if u.page is not None]
    return Chunk(
        chunk_index=index,
        text=text,
        page=pages[0] if pages else None,
        page_end=pages[-1] if pages else None,
        heading=units[-1].heading or units[0].heading,
        token_count=count_tokens(text),
    )


def chunk_pages(
    pages: list[ExtractedPage],
    target_tokens: int = 600,
    max_tokens: int = 800,
    overlap_ratio: float = 0.15,
) -> list[Chunk]:
    units = to_units(pages, max_tokens)
    overlap_tokens = int(target_tokens * overlap_ratio)
    chunks: list[Chunk] = []
    current: list[Unit] = []
    current_tokens = 0
    fresh = 0  # units added since the last emitted chunk (excludes carried-over overlap)

    for unit in units:
        heading_changed = bool(current) and unit.heading != current[-1].heading
        too_big = current_tokens + unit.tokens > target_tokens
        # Start a new chunk when full, or at a new section once the chunk is half full.
        if current and fresh and (too_big or (heading_changed and current_tokens >= target_tokens // 2)):
            chunks.append(_make_chunk(len(chunks), current))
            # carry the tail of the previous chunk forward as overlap (not across sections)
            tail: list[Unit] = []
            tail_tokens = 0
            if not heading_changed:
                for previous in reversed(current):
                    if tail_tokens + previous.tokens > overlap_tokens:
                        break
                    tail.insert(0, previous)
                    tail_tokens += previous.tokens
            current, current_tokens, fresh = tail, tail_tokens, 0
        current.append(unit)
        current_tokens += unit.tokens
        fresh += 1

    if current and fresh:
        chunks.append(_make_chunk(len(chunks), current))
    return [c for c in chunks if c.text.strip()]
