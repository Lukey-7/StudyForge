"""Layer 3 - keyword retrieval with BM25 (Okapi BM25, written out in ~25 lines).

For each query term t that appears in chunk d:

    score(d) += IDF(t) * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len(d) / avg_len))

    IDF(t) = ln(1 + (N - n_t + 0.5) / (n_t + 0.5))      N = #chunks, n_t = #chunks containing t

* IDF: rare words matter more ("B-tree" beats "data").
* k1 = 1.5: repeating a word helps, with diminishing returns (saturation).
* b = 0.75: long chunks are penalised so they don't win just by having more words.

Why not the `rank_bm25` package? Its BM25Okapi uses IDF = ln((N - n + 0.5)/(n + 0.5)),
which goes NEGATIVE when a word is in more than half the chunks - in a small
notebook that silently drops real matches (our unit test caught it). The
"1 +" inside the log (the Lucene/Elasticsearch variant) keeps IDF positive.

The index for a notebook is built in memory on first use and cached. The cache
key includes the notebook's `sources_version`, so adding/removing a source
automatically makes the old index stale (and `invalidate` drops it eagerly).
"""

import math
import threading
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass

from app.db.repository import Row
from app.retrieval.scope import Scope
from app.text_utils import tokenize

K1 = 1.5
B = 0.75


@dataclass
class BM25Index:
    version: int
    chunk_ids: list[str]
    source_ids: list[str]
    pages: list[int | None]
    term_freqs: list[Counter]  # per chunk: word -> count
    lengths: list[int]
    avg_length: float
    idf: dict[str, float]


def build_index(version: int, chunks: list[Row]) -> BM25Index:
    docs = [tokenize(f"{c.get('heading') or ''} {c['text']}") for c in chunks]
    doc_freq: Counter = Counter()
    for words in docs:
        doc_freq.update(set(words))
    n_docs = len(docs)
    idf = {word: math.log(1 + (n_docs - n + 0.5) / (n + 0.5)) for word, n in doc_freq.items()}
    lengths = [len(words) for words in docs]
    return BM25Index(
        version=version,
        chunk_ids=[c["id"] for c in chunks],
        source_ids=[c["source_id"] for c in chunks],
        pages=[c.get("page") for c in chunks],
        term_freqs=[Counter(words) for words in docs],
        lengths=lengths,
        avg_length=(sum(lengths) / n_docs) if n_docs else 0.0,
        idf=idf,
    )


def bm25_score(index: BM25Index, i: int, terms: list[str]) -> float:
    score = 0.0
    length_norm = 1 - B + B * index.lengths[i] / (index.avg_length or 1.0)
    for term in terms:
        tf = index.term_freqs[i].get(term, 0)
        if tf:
            score += index.idf[term] * tf * (K1 + 1) / (tf + K1 * length_norm)
    return score


class BM25Cache:
    def __init__(self) -> None:
        self._indexes: dict[str, BM25Index] = {}
        self._lock = threading.Lock()

    def get(self, notebook_id: str, version: int, load_chunks: Callable[[], list[Row]]) -> BM25Index:
        with self._lock:
            cached = self._indexes.get(notebook_id)
        if cached and cached.version == version:
            return cached
        index = build_index(version, load_chunks())
        with self._lock:
            self._indexes[notebook_id] = index
        return index

    def invalidate(self, notebook_id: str) -> None:
        with self._lock:
            self._indexes.pop(notebook_id, None)


def keyword_search(index: BM25Index, query: str, scope: Scope, k: int = 20) -> list[tuple[str, float]]:
    """Returns [(chunk_id, bm25_score)] best first, only chunks inside the scope."""
    terms = [t for t in tokenize(query) if t in index.idf]
    if not terms:
        return []
    hits = []
    for i, chunk_id in enumerate(index.chunk_ids):
        if not scope.allows(index.source_ids[i], index.pages[i]):
            continue
        score = bm25_score(index, i, terms)
        if score > 0:
            hits.append((chunk_id, score))
    hits.sort(key=lambda hit: hit[1], reverse=True)
    return hits[:k]
