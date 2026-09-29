"""Map-reduce for material that is too long for one prompt.

MAP:    split the chunks into groups of ~12k tokens and ask the LLM to condense
        each group into notes aimed at the target document (e.g. "a quiz").
REDUCE: concatenate the notes. If they are STILL too long, repeat on the notes.
The final pipeline prompt then runs once over the (short) combined notes.

Why: the whole-document pipelines must see everything, but one giant prompt
would exceed free-tier token-per-minute limits and dilute the model's
attention. Each map call is small, cheap and independent.
"""

import logging

from app.db.repository import Row
from app.generation.prompts import map_prompt
from app.generation.registry import PipelineSpec
from app.generation.schemas import GenerationParams
from app.llm.base import LLM
from app.text_utils import count_tokens

logger = logging.getLogger(__name__)

MAX_REDUCE_ROUNDS = 3


def format_chunk(chunk: Row, source_names: dict[str, str]) -> str:
    name = source_names.get(chunk["source_id"], "source")
    page = f", p. {chunk['page']}" if chunk.get("page") else ""
    heading = f" - {chunk['heading']}" if chunk.get("heading") else ""
    return f"### {name}{page}{heading}\n{chunk['text']}"


def group_by_tokens(blocks: list[str], group_tokens: int) -> list[list[str]]:
    groups: list[list[str]] = [[]]
    used = 0
    for block in blocks:
        tokens = count_tokens(block)
        if groups[-1] and used + tokens > group_tokens:
            groups.append([])
            used = 0
        groups[-1].append(block)
        used += tokens
    return [g for g in groups if g]


def condense(
    llm: LLM,
    blocks: list[str],
    spec: PipelineSpec,
    params: GenerationParams,
    single_pass_tokens: int,
    group_tokens: int,
) -> tuple[str, int]:
    """Return (material that fits in one prompt, number of map calls made)."""
    calls = 0
    for _ in range(MAX_REDUCE_ROUNDS):
        text = "\n\n".join(blocks)
        if count_tokens(text) <= single_pass_tokens:
            return text, calls
        groups = group_by_tokens(blocks, group_tokens)
        logger.info("map step: %d groups for %s", len(groups), spec.name)
        blocks = []
        for group in groups:
            notes = llm.generate_text(map_prompt(spec, params, "\n\n".join(group)), fast=True).text
            blocks.append(notes.strip())
            calls += 1
    # Still too long after several rounds: hard-truncate (logged, very rare).
    logger.warning("material still too long after %d reduce rounds; truncating", MAX_REDUCE_ROUNDS)
    return "\n\n".join(blocks)[: single_pass_tokens * 4], calls
