"""Liveness + configuration report (no secrets)."""

from fastapi import APIRouter, Depends

from app.api.deps import get_services
from app.services import Services

router = APIRouter(tags=["health"])


@router.get("/health")
def health(services: Services = Depends(get_services)) -> dict:
    cfg = services.settings
    return {
        "status": "ok",
        "db_backend": cfg.db_backend,
        "auth_mode": cfg.auth_mode,
        "chroma_mode": cfg.chroma_mode,
        "llm_model": cfg.llm_model if services.llm else None,
        "openai_fallback": bool(cfg.openai_api_key and cfg.llm_fallback_to_openai),
        # The embedding model that ACTUALLY ran (after any automatic fallback).
        "embedding_model": services.embedder.active_model if services.embedder else None,
        "ai_configured": services.llm is not None and services.embedder is not None,
    }
