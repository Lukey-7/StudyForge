"""Optional OpenAI text client, used ONLY as a fallback when Gemini fails.

Embeddings are never sent to OpenAI: mixing vectors from two different embedding
models in one index would make similarity scores meaningless.
"""

from collections.abc import Iterator
from typing import TypeVar

import openai
from pydantic import BaseModel

from app.config import Settings
from app.llm.base import LLMJson, LLMText
from app.llm.json_output import generate_validated, schema_hint
from app.llm.rate_limit import with_retries

M = TypeVar("M", bound=BaseModel)


def is_retryable(exc: Exception) -> bool:
    return isinstance(exc, (openai.RateLimitError, openai.APITimeoutError, openai.InternalServerError))


class OpenAIClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = openai.OpenAI(api_key=settings.openai_api_key, timeout=settings.llm_timeout_s)

    @property
    def model_name(self) -> str:
        return self.settings.openai_model

    def _messages(self, prompt: str, system: str | None) -> list[dict]:
        messages = [{"role": "system", "content": system}] if system else []
        return messages + [{"role": "user", "content": prompt}]

    def _complete(self, prompt: str, system: str | None, json_mode: bool) -> str:
        extra = {"response_format": {"type": "json_object"}} if json_mode else {}

        def call() -> str:
            response = self.client.chat.completions.create(
                model=self.model_name, messages=self._messages(prompt, system), temperature=0.3, **extra
            )
            return response.choices[0].message.content or ""

        return with_retries(call, is_retryable=is_retryable, max_attempts=3)

    def generate_text(self, prompt: str, *, system: str | None = None, fast: bool = False) -> LLMText:
        return LLMText(self._complete(prompt, system, json_mode=False), self.model_name)

    def generate_json(self, prompt: str, schema: type[M], *, system: str | None = None, fast: bool = False) -> LLMJson:
        with_schema = f"{prompt}\n\nReturn ONLY JSON matching this JSON schema:\n{schema_hint(schema)}"
        data = generate_validated(lambda p: self._complete(p, system, json_mode=True), with_schema, schema)
        return LLMJson(data, self.model_name)

    def stream_text(self, prompt: str, *, system: str | None = None) -> Iterator[str]:
        stream = self.client.chat.completions.create(
            model=self.model_name, messages=self._messages(prompt, system), temperature=0.3, stream=True
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def read_media(self, data: bytes, mime_type: str, instruction: str) -> LLMText:
        raise NotImplementedError("OCR/transcription is Gemini-only in StudyForge")
