"""One object that holds every long-lived dependency (built once at startup).

Plain constructor injection, no framework: API routes get it through the
`get_services` FastAPI dependency, and tests build one with fakes instead.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path

from app.config import Settings
from app.db.repository import FileStorage, Repository
from app.llm.base import LLM, Embedder
from app.retrieval.keyword import BM25Cache
from app.vector_store import ChromaVectorStore

logger = logging.getLogger(__name__)


@dataclass
class Services:
    settings: Settings
    repo: Repository
    storage: FileStorage
    llm: LLM | None
    embedder: Embedder | None
    vectors: ChromaVectorStore
    bm25: BM25Cache = field(default_factory=BM25Cache)

    def require_ai(self) -> tuple[LLM, Embedder]:
        if self.llm is None or self.embedder is None:
            raise RuntimeError("AI is not configured: set GEMINI_API_KEY in backend/.env")
        return self.llm, self.embedder


def build_services(settings: Settings) -> Services:
    # --- database + file storage
    if settings.db_backend == "supabase":
        from app.db.supabase_repo import SupabaseFileStorage, SupabaseRepository

        repo = SupabaseRepository(settings.supabase_url, settings.supabase_service_role_key)
        storage = SupabaseFileStorage(repo.client, settings.storage_bucket)
    else:
        from app.db.local_repo import LocalFileStorage, LocalRepository

        data_dir = Path(settings.local_data_dir)
        repo = LocalRepository(str(data_dir / "local_db.json"))
        storage = LocalFileStorage(str(data_dir / "uploads"))
        logger.warning("DB_BACKEND=memory: local demo mode (data in %s)", data_dir)

    # --- AI providers
    llm: LLM | None = None
    embedder: Embedder | None = None
    gemini = None
    if settings.gemini_api_key:
        from app.llm.gemini import GeminiClient

        gemini = GeminiClient(settings)
        embedder = gemini
    openai_client = None
    if settings.openai_api_key and settings.llm_fallback_to_openai:
        from app.llm.openai_client import OpenAIClient

        openai_client = OpenAIClient(settings)
    if gemini or openai_client:
        from app.llm.router import FallbackLLM

        llm = FallbackLLM(gemini, openai_client)
    if embedder is None:
        logger.warning("GEMINI_API_KEY missing: ingestion, search and generation are disabled")

    return Services(
        settings=settings,
        repo=repo,
        storage=storage,
        llm=llm,
        embedder=embedder,
        vectors=ChromaVectorStore(settings),
    )
