"""The 16 pipelines + a retrieval debug endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_services, get_user, owned_notebook
from app.auth import User
from app.db.repository import Row
from app.generation.registry import PIPELINES
from app.generation.runner import NoReadySources, UnknownPipeline, run_pipeline
from app.generation.schemas import GenerationParams
from app.llm.base import LLMUnavailableError
from app.llm.json_output import StructuredOutputError
from app.retrieval.retriever import MODES, Retriever
from app.retrieval.scope import Scope
from app.services import Services

router = APIRouter(tags=["generation"])


class GenerateRequest(GenerationParams):
    force: bool = False  # true = ignore the cache and regenerate


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    mode: str = "hybrid_mmr"
    source_ids: list[str] | None = None
    page_from: int | None = None
    page_to: int | None = None


@router.get("/pipelines")
def list_pipelines() -> list[dict]:
    return [
        {
            "name": p.name,
            "title": p.title,
            "description": p.description,
            "retrieval_strategy": p.retrieval_strategy,
            "default_params": p.default_params,
            "counts": p.counts,
        }
        for p in PIPELINES
    ]


@router.post("/notebooks/{notebook_id}/generate/{pipeline_name}")
def generate(
    pipeline_name: str,
    body: GenerateRequest,
    notebook: Row = Depends(owned_notebook),
    user: User = Depends(get_user),
    services: Services = Depends(get_services),
) -> dict:
    params = GenerationParams(**body.model_dump(exclude={"force"}))
    try:
        row, cached = run_pipeline(services, notebook, user.id, pipeline_name, params, force=body.force)
    except UnknownPipeline as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown pipeline {pipeline_name!r}") from exc
    except NoReadySources as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except StructuredOutputError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"the model returned invalid output: {exc}") from exc
    except (LLMUnavailableError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)[:500]) from exc
    return {**row, "cached": cached}


@router.get("/notebooks/{notebook_id}/generations")
def list_generations(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> list[Row]:
    return services.repo.list_generations(notebook["id"])


@router.post("/notebooks/{notebook_id}/search")
def search(body: SearchRequest, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    """Shows what every retrieval layer returned - great for demos and debugging."""
    if body.mode not in MODES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"mode must be one of {', '.join(MODES)}")
    scope = Scope(notebook["id"], tuple(body.source_ids or ()), body.page_from, body.page_to)
    try:
        result = Retriever(services).retrieve(body.query, scope, notebook["sources_version"], mode=body.mode)  # type: ignore[arg-type]
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {
        "query": body.query,
        "embedding_model": result.embedding_model,
        "layers": result.debug,
        "citations": [c.to_dict() for c in result.context.citations],
        "context": result.context.text,
        "context_tokens": result.context.token_count,
    }
