"""Runs any pipeline from the registry. One code path for all 16.

1. cache lookup   (notebook_id, pipeline, params_hash, sources_version)
2. gather material according to the pipeline's retrieval_strategy
3. build the personalised prompt
4. Gemini structured JSON output -> Pydantic validation (1 repair retry)
5. post-process (mind map -> Mermaid) and save to `generations`
"""

import hashlib
import json
import logging
import time

from app.db.repository import Row
from app.generation.map_reduce import condense, format_chunk
from app.generation.mermaid import to_mermaid
from app.generation.prompts import SYSTEM_PROMPT, build_prompt
from app.generation.registry import REGISTRY, PipelineSpec
from app.generation.schemas import GenerationParams, MindMapOutput
from app.retrieval.retriever import Retriever
from app.retrieval.scope import Scope
from app.services import Services
from app.text_utils import count_tokens

logger = logging.getLogger(__name__)


class NoReadySources(ValueError):
    pass


class UnknownPipeline(KeyError):
    pass


def params_hash(params: GenerationParams) -> str:
    """Stable hash: same params in any key order -> same hash -> cache hit."""
    normalized = params.model_dump()
    normalized["focus_topic"] = (normalized.get("focus_topic") or "").strip().lower() or None
    normalized["source_ids"] = sorted(normalized["source_ids"]) if normalized.get("source_ids") else None
    return hashlib.sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest()[:24]


def gather_material(
    services: Services, spec: PipelineSpec, params: GenerationParams, notebook: Row, ready: list[Row]
) -> tuple[str, dict]:
    """Return (source material text, metadata about how it was gathered)."""
    llm, _ = services.require_ai()
    cfg = services.settings
    names = {s["id"]: s["file_name"] for s in ready}
    source_ids = [s["id"] for s in ready]

    if spec.retrieval_strategy == "top_k_for_topic":
        query = params.focus_topic or spec.default_query
        result = Retriever(services).retrieve(
            query,
            Scope(notebook["id"], tuple(source_ids)),
            notebook["sources_version"],
            final_k=max(cfg.final_k, 12),
            token_budget=cfg.context_token_budget * 2,
        )
        return result.context.text, {
            "strategy": spec.retrieval_strategy,
            "query": query,
            "chunks_used": len(result.context.citations),
        }

    chunks = services.repo.list_chunks(notebook["id"], source_ids)
    if spec.retrieval_strategy == "whole_notebook_map_reduce":
        blocks = [format_chunk(c, names) for c in chunks]
        text, map_calls = condense(llm, blocks, spec, params, cfg.generation_single_pass_tokens, cfg.map_group_tokens)
        return text, {"strategy": spec.retrieval_strategy, "chunks_used": len(chunks), "map_calls": map_calls}

    # per_source: every source gets an equal share of the prompt budget.
    per_source_budget = max(2000, cfg.generation_single_pass_tokens // max(1, len(ready)))
    parts: list[str] = []
    total_calls = 0
    for source in ready:
        blocks = [format_chunk(c, names) for c in chunks if c["source_id"] == source["id"]]
        text, calls = condense(llm, blocks, spec, params, per_source_budget, cfg.map_group_tokens)
        parts.append(f"## SOURCE: {source['file_name']}\n{text}")
        total_calls += calls
    return "\n\n".join(parts), {
        "strategy": spec.retrieval_strategy,
        "chunks_used": len(chunks),
        "map_calls": total_calls,
    }


def run_pipeline(
    services: Services,
    notebook: Row,
    user_id: str,
    pipeline_name: str,
    params: GenerationParams,
    force: bool = False,
) -> tuple[Row, bool]:
    """Returns (generation row, served_from_cache)."""
    spec = REGISTRY.get(pipeline_name)
    if spec is None:
        raise UnknownPipeline(pipeline_name)
    llm, _ = services.require_ai()

    key = params_hash(params)
    version = notebook["sources_version"]
    if not force:
        cached = services.repo.find_generation(notebook["id"], spec.name, key, version)
        if cached:
            return cached, True

    ready = [s for s in services.repo.list_sources(notebook["id"]) if s["status"] == "ready"]
    if params.source_ids:
        ready = [s for s in ready if s["id"] in set(params.source_ids)]
    if not ready:
        raise NoReadySources("no ready sources in this notebook yet - upload a document and wait for 'ready'")

    started = time.perf_counter()
    material, meta = gather_material(services, spec, params, notebook, ready)
    prompt = build_prompt(spec, params, material)
    result = llm.generate_json(prompt, spec.output_schema, system=SYSTEM_PROMPT)

    output = result.data.model_dump()
    if isinstance(result.data, MindMapOutput):
        output["mermaid"] = to_mermaid(result.data)
    output["_meta"] = {**meta, "prompt_tokens_est": count_tokens(prompt)}
    latency_ms = int((time.perf_counter() - started) * 1000)

    row = services.repo.save_generation(
        {
            "notebook_id": notebook["id"],
            "user_id": user_id,
            "pipeline_name": spec.name,
            "params": params.model_dump(),
            "params_hash": key,
            "sources_version": version,
            "output": output,
            "model": result.model,
            "latency_ms": latency_ms,
        }
    )
    logger.info("pipeline %s done in %d ms (model=%s, %s)", spec.name, latency_ms, result.model, meta)
    return row, False
