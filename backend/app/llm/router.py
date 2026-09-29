"""Primary/fallback LLM: try Gemini first; if it is down or out of quota, use OpenAI.

This is the "circuit" in one place, so no other module needs to know that two
providers exist.
"""

import logging
from collections.abc import Iterator
from typing import TypeVar

from pydantic import BaseModel

from app.llm.base import LLM, LLMJson, LLMText, LLMUnavailableError
from app.llm.json_output import StructuredOutputError

logger = logging.getLogger(__name__)
M = TypeVar("M", bound=BaseModel)


class FallbackLLM:
    def __init__(self, primary: LLM | None, fallback: LLM | None) -> None:
        self.providers = [p for p in (primary, fallback) if p is not None]
        if not self.providers:
            raise LLMUnavailableError("no LLM provider configured: set GEMINI_API_KEY and/or OPENAI_API_KEY")

    @property
    def model_name(self) -> str:
        return self.providers[0].model_name

    def _run(self, action: str, fn):
        last_error: Exception | None = None
        for provider in self.providers:
            try:
                return fn(provider)
            except (StructuredOutputError, NotImplementedError):
                raise
            except Exception as exc:  # noqa: BLE001 - try the next provider
                last_error = exc
                logger.warning("%s failed on %s: %s", action, provider.model_name, str(exc)[:300])
        raise LLMUnavailableError(f"{action} failed on all providers: {last_error}") from last_error

    def generate_text(self, prompt: str, *, system: str | None = None, fast: bool = False) -> LLMText:
        return self._run("generate_text", lambda p: p.generate_text(prompt, system=system, fast=fast))

    def generate_json(self, prompt: str, schema: type[M], *, system: str | None = None, fast: bool = False) -> LLMJson:
        return self._run("generate_json", lambda p: p.generate_json(prompt, schema, system=system, fast=fast))

    def stream_text(self, prompt: str, *, system: str | None = None) -> Iterator[str]:
        """Fallback only helps if the FIRST token fails; mid-stream errors propagate."""
        last_error: Exception | None = None
        for provider in self.providers:
            stream = provider.stream_text(prompt, system=system)
            try:
                first = next(stream)
            except StopIteration:
                return
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning("stream failed on %s: %s", provider.model_name, str(exc)[:300])
                continue
            yield first
            yield from stream
            return
        raise LLMUnavailableError(f"streaming failed on all providers: {last_error}") from last_error

    def read_media(self, data: bytes, mime_type: str, instruction: str) -> LLMText:
        return self.providers[0].read_media(data, mime_type, instruction)
