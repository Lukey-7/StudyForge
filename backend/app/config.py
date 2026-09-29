"""Application settings, read once from environment variables / .env.

Why pydantic-settings: every setting gets a type and a default in ONE place,
and a typo in .env (e.g. CHUNK_TARGET_TOKENS=abc) fails loudly at startup
instead of causing a weird bug later.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- General -----------------------------------------------------------
    app_env: Literal["dev", "prod", "test"] = "dev"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # "supabase" = real Postgres/Auth/Storage in the cloud.
    # "memory"   = local demo mode: in-process tables + files on disk, fixed dev user.
    db_backend: Literal["supabase", "memory"] = "memory"
    auth_mode: Literal["supabase", "dev"] = "dev"
    local_data_dir: str = str(BACKEND_DIR / "data")

    # --- Supabase ------------------------------------------------------------
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    storage_bucket: str = "sources"

    # --- Gemini --------------------------------------------------------------
    gemini_api_key: str = ""
    llm_model: str = "gemini-3.8-flash"  # any current Gemini Flash; verified working 2026-09-29
    # gemini-embedding-001 replaced text-embedding-004 (retired by Google). The fallback is
    # tried automatically if the primary model is rejected; leave empty for no fallback.
    embedding_model: str = "gemini-embedding-001"
    embedding_fallback_model: str = ""
    embedding_dim: int = 768
    gemini_rpm: int = 10  # client-side requests/minute cap (free-tier friendly)
    embed_rpm: int = 100
    llm_timeout_s: int = 120

    # --- Optional OpenAI fallback (used only when Gemini is unavailable) ----
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    llm_fallback_to_openai: bool = True

    # --- Chroma --------------------------------------------------------------
    # "embedded" = chromadb.PersistentClient writing to chroma_path (no server).
    # "http"     = a separate Chroma server at chroma_host:chroma_port.
    chroma_mode: Literal["embedded", "http"] = "embedded"
    chroma_path: str = str(BACKEND_DIR / "data" / "chroma")
    chroma_host: str = "localhost"
    chroma_port: int = 8000

    # --- Ingestion -------------------------------------------------------------
    chunk_target_tokens: int = 600
    chunk_max_tokens: int = 800
    chunk_overlap_ratio: float = 0.15
    embed_batch_size: int = 50
    max_upload_mb: int = 25
    max_ocr_pages: int = 30

    # --- Retrieval ---------------------------------------------------------------
    dense_k: int = 20
    keyword_k: int = 20
    rrf_k: int = 60
    mmr_lambda: float = 0.7
    final_k: int = 8
    context_token_budget: int = 6000
    # On by default: in our eval the LLM rerank raised MRR 0.92 -> 0.98 (eval/results.md).
    rerank_with_llm: bool = True

    # --- Knowledge model (living textbook) --------------------------------------
    knowledge_enabled: bool = True
    knowledge_batch_passages: int = 6  # passages per extraction call
    concept_merge_similarity: float = 0.88  # at least this close: the LLM judges if it is the same concept
    claim_compare_similarity: float = 0.80  # below this, a claim is new without asking the LLM
    knowledge_max_passages_per_hour: int = 150  # free-tier budget for background extraction
    book_enabled: bool = True  # write the book from the knowledge model after every change
    book_max_passages_per_section: int = 12  # evidence passages given to the writer per section
    book_max_sections_per_day: int = 60  # free-tier cap on section writes per notebook (each is 2-4 calls)
    book_search_min_similarity: float = 0.6  # below this, a section/concept matches only by words

    # --- Chat / generation guardrails --------------------------------------------
    chat_max_history_turns: int = 6
    # Gemini Flash accepts ~1M input tokens, so most notebooks go to the model in ONE call.
    # Map-reduce only kicks in above this (also keeps us under free-tier tokens/minute).
    generation_single_pass_tokens: int = 150000
    map_group_tokens: int = 60000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
