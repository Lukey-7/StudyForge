"""Tiny text helpers shared by ingestion and retrieval."""

import re

_WORD = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")

# Very common words carry no meaning for keyword search; dropping them makes
# BM25 focus on the words that actually distinguish one chunk from another.
STOPWORDS = frozenset(
    """a an and are as at be but by for from has have he her his i in into is it its
    of on or our she so than that the their them then there these they this to was
    we were what when where which who why will with you your do does did not no can
    about how also may such been being over under between more most other some any
    each only own same very just should would could""".split()
)


def count_tokens(text: str) -> int:
    """Approximate token count: ~4 characters per token for English text.

    Good enough for budgeting chunk sizes and context windows, needs no
    tokenizer download, and is easy to explain. Exact counts are not needed
    because every budget keeps a safety margin.
    """
    return max(1, len(text) // 4)


def tokenize(text: str) -> list[str]:
    """Lowercase word tokens without stopwords (used by BM25)."""
    return [w for w in _WORD.findall(text.lower()) if w not in STOPWORDS and len(w) > 1]


def snippet(text: str, max_chars: int = 240) -> str:
    text = " ".join(text.split())
    return text if len(text) <= max_chars else text[: max_chars - 1].rsplit(" ", 1)[0] + "…"
