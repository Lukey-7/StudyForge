"""Local demo-mode repository: the same tables as the SQL schema, kept in a JSON file.

Used when DB_BACKEND=memory (no Supabase keys yet) and in tests. It mimics the
Postgres behaviour we rely on: generated ids/timestamps, the unique keys, and
ON DELETE CASCADE. Not meant for production (single process, whole-file writes).
"""

import json
import os
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.db.repository import Row

TABLES = ("profiles", "notebooks", "sources", "chunks", "generations", "chat_sessions", "chat_messages")
# The knowledge model (migrations/002_knowledge.sql). Accessed through the generic table methods.
KNOWLEDGE_TABLES = ("concepts", "concept_links", "claims", "claim_evidence", "conflicts", "knowledge_jobs")


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class LocalRepository:
    def __init__(self, path: str | None = None) -> None:
        self.path = Path(path) if path else None
        self._lock = threading.RLock()
        self.t: dict[str, dict[str, Row]] = {name: {} for name in TABLES + KNOWLEDGE_TABLES}
        if self.path and self.path.exists():
            loaded = json.loads(self.path.read_text(encoding="utf-8"))
            for name in TABLES + KNOWLEDGE_TABLES:
                self.t[name] = loaded.get(name, {})

    # ---------------------------------------------------------------- helpers
    def _save(self) -> None:
        if not self.path:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.t), encoding="utf-8")
        os.replace(tmp, self.path)  # atomic swap: never leaves a half-written file

    def _insert(self, table: str, row: Row) -> Row:
        row = dict(row)
        row.setdefault("id", str(uuid.uuid4()))
        row.setdefault("created_at", now_iso())
        self.t[table][row["id"]] = row
        return dict(row)

    def _where(self, table: str, **equals) -> list[Row]:
        return [dict(r) for r in self.t[table].values() if all(r.get(k) == v for k, v in equals.items())]

    def _delete_where(self, table: str, **equals) -> list[str]:
        ids = [r["id"] for r in self._where(table, **equals)]
        for row_id in ids:
            del self.t[table][row_id]
        return ids

    # ------------------------------------------------ generic table access (knowledge model)
    def insert(self, table: str, row: Row) -> Row:
        with self._lock:
            created = self._insert(table, {**row, "updated_at": now_iso()} if table in ("concepts", "knowledge_jobs") else row)
            self._save()
            return created

    def select(self, table: str, **equals) -> list[Row]:
        with self._lock:
            return sorted(self._where(table, **equals), key=lambda r: r["created_at"])

    def update(self, table: str, row_id: str, fields: Row) -> Row:
        with self._lock:
            self.t[table][row_id].update(fields, updated_at=now_iso())
            self._save()
            return dict(self.t[table][row_id])

    def delete(self, table: str, **equals) -> None:
        with self._lock:
            ids = self._delete_where(table, **equals)
            # emulate ON DELETE CASCADE inside the knowledge model
            for row_id in ids:
                if table == "concepts":
                    for claim_id in self._delete_where("claims", concept_id=row_id):
                        self._delete_where("claim_evidence", claim_id=claim_id)
                        self._delete_where("conflicts", claim_id=claim_id)
                    self._delete_where("concept_links", from_id=row_id)
                    self._delete_where("concept_links", to_id=row_id)
                elif table == "claims":
                    self._delete_where("claim_evidence", claim_id=row_id)
                    self._delete_where("conflicts", claim_id=row_id)
            self._save()

    # --------------------------------------------------------------- profiles
    def ensure_profile(self, user_id: str, email: str | None) -> None:
        with self._lock:
            if user_id not in self.t["profiles"]:
                self._insert("profiles", {"id": user_id, "email": email})
                self._save()

    # -------------------------------------------------------------- notebooks
    def create_notebook(self, user_id: str, title: str, description: str | None) -> Row:
        with self._lock:
            row = self._insert(
                "notebooks",
                {"user_id": user_id, "title": title, "description": description, "sources_version": 0, "updated_at": now_iso()},
            )
            self._save()
            return row

    def list_notebooks(self, user_id: str) -> list[Row]:
        with self._lock:
            rows = self._where("notebooks", user_id=user_id)
        return sorted(rows, key=lambda r: r["created_at"], reverse=True)

    def get_notebook(self, user_id: str, notebook_id: str) -> Row | None:
        with self._lock:
            row = self.t["notebooks"].get(notebook_id)
            return dict(row) if row and row["user_id"] == user_id else None

    def update_notebook(self, notebook_id: str, fields: Row) -> Row:
        with self._lock:
            self.t["notebooks"][notebook_id].update(fields, updated_at=now_iso())
            self._save()
            return dict(self.t["notebooks"][notebook_id])

    def delete_notebook(self, notebook_id: str) -> None:
        with self._lock:  # emulate ON DELETE CASCADE
            for session_id in self._delete_where("chat_sessions", notebook_id=notebook_id):
                self._delete_where("chat_messages", session_id=session_id)
            for table in ("chunks", "sources", "generations", *KNOWLEDGE_TABLES):
                self._delete_where(table, notebook_id=notebook_id)
            self.t["notebooks"].pop(notebook_id, None)
            self._save()

    def bump_sources_version(self, notebook_id: str) -> int:
        with self._lock:
            notebook = self.t["notebooks"][notebook_id]
            notebook["sources_version"] = notebook.get("sources_version", 0) + 1
            notebook["updated_at"] = now_iso()
            self._save()
            return notebook["sources_version"]

    # ---------------------------------------------------------------- sources
    def create_source(self, row: Row) -> Row:
        with self._lock:
            if self.find_source_by_hash(row["notebook_id"], row["content_hash"]):
                raise ValueError("duplicate key: (notebook_id, content_hash)")
            created = self._insert("sources", {**row, "updated_at": now_iso()})
            self._save()
            return created

    def get_source(self, source_id: str) -> Row | None:
        with self._lock:
            row = self.t["sources"].get(source_id)
            return dict(row) if row else None

    def list_sources(self, notebook_id: str) -> list[Row]:
        with self._lock:
            rows = self._where("sources", notebook_id=notebook_id)
        return sorted(rows, key=lambda r: r["created_at"])

    def find_source_by_hash(self, notebook_id: str, content_hash: str) -> Row | None:
        with self._lock:
            rows = self._where("sources", notebook_id=notebook_id, content_hash=content_hash)
            return rows[0] if rows else None

    def update_source(self, source_id: str, fields: Row) -> Row:
        with self._lock:
            self.t["sources"][source_id].update(fields, updated_at=now_iso())
            self._save()
            return dict(self.t["sources"][source_id])

    def delete_source(self, source_id: str) -> None:
        with self._lock:
            self._delete_where("chunks", source_id=source_id)
            for table in ("claim_evidence", "conflicts", "knowledge_jobs"):
                self._delete_where(table, source_id=source_id)
            self.t["sources"].pop(source_id, None)
            self._save()

    # ----------------------------------------------------------------- chunks
    def replace_chunks(self, source_id: str, rows: list[Row]) -> None:
        with self._lock:
            self._delete_where("chunks", source_id=source_id)
            for row in rows:
                self._insert("chunks", row)
            self._save()

    def list_chunks(self, notebook_id: str, source_ids: list[str] | None = None) -> list[Row]:
        with self._lock:
            rows = self._where("chunks", notebook_id=notebook_id)
        if source_ids:
            wanted = set(source_ids)
            rows = [r for r in rows if r["source_id"] in wanted]
        return sorted(rows, key=lambda r: (r["source_id"], r["chunk_index"]))

    def get_chunks(self, chunk_ids: list[str]) -> list[Row]:
        with self._lock:
            return [dict(self.t["chunks"][i]) for i in chunk_ids if i in self.t["chunks"]]

    # ------------------------------------------------------------ generations
    def find_generation(self, notebook_id: str, pipeline_name: str, params_hash: str, sources_version: int) -> Row | None:
        with self._lock:
            rows = self._where(
                "generations",
                notebook_id=notebook_id,
                pipeline_name=pipeline_name,
                params_hash=params_hash,
                sources_version=sources_version,
            )
            return rows[0] if rows else None

    def save_generation(self, row: Row) -> Row:
        with self._lock:
            existing = self.find_generation(row["notebook_id"], row["pipeline_name"], row["params_hash"], row["sources_version"])
            if existing:  # upsert on the cache key
                del self.t["generations"][existing["id"]]
            saved = self._insert("generations", row)
            self._save()
            return saved

    def list_generations(self, notebook_id: str, limit: int = 50) -> list[Row]:
        with self._lock:
            rows = self._where("generations", notebook_id=notebook_id)
        return sorted(rows, key=lambda r: r["created_at"], reverse=True)[:limit]

    def list_recent_generations(self, user_id: str, limit: int = 8) -> list[Row]:
        with self._lock:
            rows = self._where("generations", user_id=user_id)
        rows = sorted(rows, key=lambda r: r["created_at"], reverse=True)[:limit]
        return [{k: v for k, v in r.items() if k != "output"} for r in rows]

    def count_generations(self, user_id: str) -> int:
        with self._lock:
            return len(self._where("generations", user_id=user_id))

    def get_generation(self, generation_id: str) -> Row | None:
        with self._lock:
            row = self.t["generations"].get(generation_id)
            return dict(row) if row else None

    # ------------------------------------------------------------------- chat
    def create_chat_session(self, row: Row) -> Row:
        with self._lock:
            created = self._insert("chat_sessions", {**row, "updated_at": now_iso()})
            self._save()
            return created

    def get_chat_session(self, session_id: str) -> Row | None:
        with self._lock:
            row = self.t["chat_sessions"].get(session_id)
            return dict(row) if row else None

    def list_chat_sessions(self, notebook_id: str) -> list[Row]:
        with self._lock:
            rows = self._where("chat_sessions", notebook_id=notebook_id)
        return sorted(rows, key=lambda r: r["updated_at"], reverse=True)

    def list_recent_chat_sessions(self, user_id: str, limit: int = 6) -> list[Row]:
        with self._lock:
            rows = self._where("chat_sessions", user_id=user_id)
        return sorted(rows, key=lambda r: r["updated_at"], reverse=True)[:limit]

    def touch_chat_session(self, session_id: str) -> None:
        with self._lock:
            if session_id in self.t["chat_sessions"]:
                self.t["chat_sessions"][session_id]["updated_at"] = now_iso()
                self._save()

    def delete_chat_session(self, session_id: str) -> None:
        with self._lock:
            self._delete_where("chat_messages", session_id=session_id)
            self.t["chat_sessions"].pop(session_id, None)
            self._save()

    def add_chat_message(self, row: Row) -> Row:
        with self._lock:
            created = self._insert("chat_messages", row)
            self._save()
            return created

    def list_chat_messages(self, session_id: str, limit: int | None = None) -> list[Row]:
        with self._lock:
            rows = sorted(self._where("chat_messages", session_id=session_id), key=lambda r: r["created_at"])
        return rows[-limit:] if limit else rows


class LocalFileStorage:
    """Original files on local disk (demo mode)."""

    def __init__(self, root: str) -> None:
        self.root = Path(root)

    def _full(self, path: str) -> Path:
        full = (self.root / path).resolve()
        if self.root.resolve() not in full.parents:
            raise ValueError("invalid storage path")
        return full

    def put(self, path: str, data: bytes, content_type: str) -> None:
        full = self._full(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)

    def get(self, path: str) -> bytes:
        return self._full(path).read_bytes()

    def delete(self, paths: list[str]) -> None:
        for path in paths:
            self._full(path).unlink(missing_ok=True)
