"""Layer 1 - scope filter: which chunks are we even allowed to search?

Always one notebook; optionally only some sources and/or a page range.
The same Scope is translated into a Chroma `where` filter (dense search) and
into a plain Python check (keyword search), so both retrievers see the same set.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Scope:
    notebook_id: str
    source_ids: tuple[str, ...] = ()
    page_from: int | None = None
    page_to: int | None = None

    def to_chroma_where(self) -> dict:
        clauses: list[dict] = [{"notebook_id": self.notebook_id}]
        if self.source_ids:
            clauses.append({"source_id": {"$in": list(self.source_ids)}})
        if self.page_from is not None:
            clauses.append({"page": {"$gte": self.page_from}})
        if self.page_to is not None:
            clauses.append({"page": {"$lte": self.page_to}})
        # Chroma requires "$and" to have 2+ clauses.
        return clauses[0] if len(clauses) == 1 else {"$and": clauses}

    def allows(self, source_id: str, page: int | None) -> bool:
        if self.source_ids and source_id not in self.source_ids:
            return False
        page = page or 0
        if self.page_from is not None and page < self.page_from:
            return False
        if self.page_to is not None and page > self.page_to:
            return False
        return True
