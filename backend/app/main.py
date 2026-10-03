"""FastAPI application factory.

Run locally:   uvicorn app.main:create_app --factory --reload --port 8080
(--factory tells uvicorn to call create_app(); importing this module in tests
therefore has no side effects.)
"""

import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import book, chat, generate, health, knowledge, me, notebooks, sources
from app.auth import Authenticator
from app.config import Settings, get_settings
from app.services import Services, build_services


def setup_logging(level: str) -> None:
    """One line per event: time, level, module, message - easy to grep, works in Cloud Run logs."""
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        stream=sys.stdout,
        force=True,
    )
    for noisy in ("httpx", "httpcore", "chromadb", "google_genai.models", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def create_app(settings: Settings | None = None, services: Services | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level)

    app = FastAPI(
        title="StudyForge API",
        version="2.0.0",
        description="RAG-based document-to-learning platform: ingestion, hybrid retrieval, 16 pipelines, chat.",
    )
    app.state.services = services or build_services(settings)
    repo_client = getattr(app.state.services.repo, "client", None)  # reuse the Supabase client if we have one
    app.state.authenticator = Authenticator(settings, supabase_client=repo_client)
    app.state.known_users = set()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for module in (health, me, notebooks, sources, knowledge, book, generate, chat):
        app.include_router(module.router)

    _fail_interrupted_jobs(app.state.services)
    from app.reindex import reindex_on_start

    reindex_on_start(app.state.services)
    from app.knowledge.build import start_resumer

    start_resumer(app.state.services)
    logging.getLogger(__name__).info(
        "StudyForge API ready (db=%s, auth=%s, chroma=%s)", settings.db_backend, settings.auth_mode, settings.chroma_mode
    )
    return app


def _fail_interrupted_jobs(services) -> None:
    """Background jobs die with the process. A job still 'running' at startup was interrupted;
    marking it failed stops the app waiting on it (its sections are rewritten on the next sync)."""
    try:
        for job in services.repo.select("knowledge_jobs", status="running"):
            services.repo.update("knowledge_jobs", job["id"], {"status": "failed", "detail": "Interrupted by a server restart"})
    except Exception:  # noqa: BLE001 - e.g. migration 002 not run yet
        logging.getLogger(__name__).warning("could not check for interrupted knowledge jobs")
