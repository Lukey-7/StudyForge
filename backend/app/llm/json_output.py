"""Turn raw model text into a validated Pydantic object, with ONE repair attempt.

Flow:  ask for JSON -> parse + validate against the schema
       -> if it fails, ask again and include the exact validation error
       -> if it fails a second time, raise (the API returns a clean 502).
"""

import json
import logging
import re
from collections.abc import Callable
from typing import TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)
M = TypeVar("M", bound=BaseModel)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class StructuredOutputError(RuntimeError):
    pass


def parse_model_json(text: str, schema: type[M]) -> M:
    """Strip accidental ``` fences, then validate. Raises ValidationError / ValueError."""
    cleaned = _FENCE.sub("", text.strip()).strip()
    return schema.model_validate_json(cleaned)


def schema_hint(schema: type[BaseModel]) -> str:
    """A compact JSON schema to paste into prompts for providers without native schema support."""
    return json.dumps(schema.model_json_schema(), separators=(",", ":"))


def generate_validated(call: Callable[[str], str], prompt: str, schema: type[M]) -> M:
    """`call(prompt) -> raw text`. Validate; on failure retry once with the error attached."""
    raw = call(prompt)
    try:
        return parse_model_json(raw, schema)
    except (ValidationError, ValueError) as first_error:
        logger.warning("structured output failed validation, retrying once: %s", str(first_error)[:300])
        repair_prompt = (
            f"{prompt}\n\n---\nYour previous answer was not valid for the required JSON schema.\n"
            f"Validation error:\n{str(first_error)[:1500]}\n"
            "Return ONLY corrected JSON that matches the schema exactly."
        )
        raw = call(repair_prompt)
        try:
            return parse_model_json(raw, schema)
        except (ValidationError, ValueError) as second_error:
            raise StructuredOutputError(
                f"model output did not match {schema.__name__}: {str(second_error)[:500]}"
            ) from second_error
