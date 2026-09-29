"""Production repository: Supabase Postgres (via PostgREST) + Supabase Storage.

Each method is one small query. supabase-py builds an HTTP request to PostgREST,
e.g.  table("sources").select("*").eq("notebook_id", x)  ->
      GET /rest/v1/sources?select=*&notebook_id=eq.x
"""

from datetime import UTC, datetime

from supabase import Client, create_client

from app.db.repository import Row

CHUNK_INSERT_BATCH = 500


def _now() -> str:
    return datetime.now(UTC).isoformat()


class SupabaseRepository:
    def __init__(self, url: str, service_role_key: str) -> None:
        if not url or not service_role_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DB_BACKEND=supabase")
        self.client: Client = create_client(url, service_role_key)

    def _t(self, name: str):
        return self.client.table(name)

    @staticmethod
    def _one(response) -> Row | None:
        return response.data[0] if response.data else None

    # --------------------------------------------------------------- profiles
    def ensure_profile(self, user_id: str, email: str | None) -> None:
        # The auth trigger normally creates it; this covers users created before the migration.
        self._t("profiles").upsert({"id": user_id, "email": email}, on_conflict="id", ignore_duplicates=True).execute()

    # -------------------------------------------------------------- notebooks
    def create_notebook(self, user_id: str, title: str, description: str | None) -> Row:
        response = self._t("notebooks").insert({"user_id": user_id, "title": title, "description": description}).execute()
        return response.data[0]

    def list_notebooks(self, user_id: str) -> list[Row]:
        return self._t("notebooks").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data

    def get_notebook(self, user_id: str, notebook_id: str) -> Row | None:
        return self._one(self._t("notebooks").select("*").eq("id", notebook_id).eq("user_id", user_id).limit(1).execute())

    def update_notebook(self, notebook_id: str, fields: Row) -> Row:
        response = self._t("notebooks").update({**fields, "updated_at": _now()}).eq("id", notebook_id).execute()
        return response.data[0]

    def delete_notebook(self, notebook_id: str) -> None:
        self._t("notebooks").delete().eq("id", notebook_id).execute()  # children go via ON DELETE CASCADE

    def bump_sources_version(self, notebook_id: str) -> int:
        response = self.client.rpc("bump_sources_version", {"p_notebook_id": notebook_id}).execute()
        return int(response.data)

    # ---------------------------------------------------------------- sources
    def create_source(self, row: Row) -> Row:
        return self._t("sources").insert(row).execute().data[0]

    def get_source(self, source_id: str) -> Row | None:
        return self._one(self._t("sources").select("*").eq("id", source_id).limit(1).execute())

    def list_sources(self, notebook_id: str) -> list[Row]:
        return self._t("sources").select("*").eq("notebook_id", notebook_id).order("created_at").execute().data

    def find_source_by_hash(self, notebook_id: str, content_hash: str) -> Row | None:
        return self._one(
            self._t("sources").select("*").eq("notebook_id", notebook_id).eq("content_hash", content_hash).limit(1).execute()
        )

    def update_source(self, source_id: str, fields: Row) -> Row:
        response = self._t("sources").update({**fields, "updated_at": _now()}).eq("id", source_id).execute()
        return response.data[0]

    def delete_source(self, source_id: str) -> None:
        self._t("sources").delete().eq("id", source_id).execute()

    # ----------------------------------------------------------------- chunks
    def replace_chunks(self, source_id: str, rows: list[Row]) -> None:
        self._t("chunks").delete().eq("source_id", source_id).execute()
        for start in range(0, len(rows), CHUNK_INSERT_BATCH):
            self._t("chunks").insert(rows[start : start + CHUNK_INSERT_BATCH]).execute()

    def list_chunks(self, notebook_id: str, source_ids: list[str] | None = None) -> list[Row]:
        rows: list[Row] = []
        page_size = 1000  # PostgREST caps a single response at 1000 rows by default
        offset = 0
        while True:
            query = self._t("chunks").select("*").eq("notebook_id", notebook_id)
            if source_ids:
                query = query.in_("source_id", source_ids)
            batch = query.order("source_id").order("chunk_index").range(offset, offset + page_size - 1).execute().data
            rows.extend(batch)
            if len(batch) < page_size:
                return rows
            offset += page_size

    def get_chunks(self, chunk_ids: list[str]) -> list[Row]:
        if not chunk_ids:
            return []
        return self._t("chunks").select("*").in_("id", chunk_ids).execute().data

    # ------------------------------------------------------------ generations
    def find_generation(self, notebook_id: str, pipeline_name: str, params_hash: str, sources_version: int) -> Row | None:
        return self._one(
            self._t("generations")
            .select("*")
            .eq("notebook_id", notebook_id)
            .eq("pipeline_name", pipeline_name)
            .eq("params_hash", params_hash)
            .eq("sources_version", sources_version)
            .limit(1)
            .execute()
        )

    def save_generation(self, row: Row) -> Row:
        response = (
            self._t("generations").upsert(row, on_conflict="notebook_id,pipeline_name,params_hash,sources_version").execute()
        )
        return response.data[0]

    def list_generations(self, notebook_id: str, limit: int = 50) -> list[Row]:
        return (
            self._t("generations")
            .select("*")
            .eq("notebook_id", notebook_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
        )

    # Uses the generations(user_id) index. The output column is left out: it can be large
    # and the home page only needs to list what was made.
    def list_recent_generations(self, user_id: str, limit: int = 8) -> list[Row]:
        return (
            self._t("generations")
            .select("id, notebook_id, pipeline_name, params, model, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
        )

    def count_generations(self, user_id: str) -> int:
        response = self._t("generations").select("id", count="exact").eq("user_id", user_id).limit(1).execute()
        return int(response.count or 0)

    def get_generation(self, generation_id: str) -> Row | None:
        return self._one(self._t("generations").select("*").eq("id", generation_id).limit(1).execute())

    # ------------------------------------------------------------------- chat
    def create_chat_session(self, row: Row) -> Row:
        return self._t("chat_sessions").insert(row).execute().data[0]

    def get_chat_session(self, session_id: str) -> Row | None:
        return self._one(self._t("chat_sessions").select("*").eq("id", session_id).limit(1).execute())

    def list_chat_sessions(self, notebook_id: str) -> list[Row]:
        return self._t("chat_sessions").select("*").eq("notebook_id", notebook_id).order("updated_at", desc=True).execute().data

    def list_recent_chat_sessions(self, user_id: str, limit: int = 6) -> list[Row]:
        return (
            self._t("chat_sessions").select("*").eq("user_id", user_id).order("updated_at", desc=True).limit(limit).execute().data
        )

    def touch_chat_session(self, session_id: str) -> None:
        self._t("chat_sessions").update({"updated_at": _now()}).eq("id", session_id).execute()

    def delete_chat_session(self, session_id: str) -> None:
        self._t("chat_sessions").delete().eq("id", session_id).execute()

    def add_chat_message(self, row: Row) -> Row:
        return self._t("chat_messages").insert(row).execute().data[0]

    def list_chat_messages(self, session_id: str, limit: int | None = None) -> list[Row]:
        if limit:  # newest N, returned oldest-first
            rows = (
                self._t("chat_messages")
                .select("*")
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
                .data
            )
            return list(reversed(rows))
        return self._t("chat_messages").select("*").eq("session_id", session_id).order("created_at").execute().data


class SupabaseFileStorage:
    def __init__(self, client: Client, bucket: str) -> None:
        self.bucket = client.storage.from_(bucket)

    def put(self, path: str, data: bytes, content_type: str) -> None:
        self.bucket.upload(path, data, {"content-type": content_type, "upsert": "true"})

    def get(self, path: str) -> bytes:
        return self.bucket.download(path)

    def delete(self, paths: list[str]) -> None:
        if paths:
            self.bucket.remove(paths)
