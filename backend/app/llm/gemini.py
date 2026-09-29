"""Google Gemini client: text, structured JSON, streaming, OCR/transcription, embeddings.

Uses the official `google-genai` SDK (`from google import genai`).
Every call goes through a RateLimiter (stay under free-tier quota) and
`with_retries` (exponential backoff on 429 / 5xx).
"""

import logging
import math
import threading
from collections.abc import Iterator
from typing import TypeVar

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel

from app.config import Settings
from app.llm.base import LLMJson, LLMText
from app.llm.json_output import generate_validated, schema_hint
from app.llm.rate_limit import RateLimiter, with_retries

logger = logging.getLogger(__name__)
M = TypeVar("M", bound=BaseModel)

RETRYABLE_STATUS = {429, 500, 502, 503, 504}
MAX_INLINE_MEDIA_BYTES = 18 * 1024 * 1024  # inline request limit is ~20 MB


def is_retryable(exc: Exception) -> bool:
    if isinstance(exc, genai_errors.APIError):
        return exc.code in RETRYABLE_STATUS
    return isinstance(exc, (httpx.TimeoutException, httpx.TransportError))


def l2_normalize(vector: list[float]) -> list[float]:
    """Unit-length vectors make cosine similarity == dot product.
    Required for gemini-embedding-001 when output_dimensionality < 3072."""
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


class GeminiClient:
    """Implements both the `LLM` and the `Embedder` interfaces from app.llm.base."""

    def __init__(self, settings: Settings) -> None:
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not set")
        self.settings = settings
        self.client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=settings.llm_timeout_s * 1000),
        )
        self.gen_limiter = RateLimiter(settings.gemini_rpm)
        self.embed_limiter = RateLimiter(settings.embed_rpm)
        self._embedding_model = settings.embedding_model
        self._embed_lock = threading.Lock()
        self._embedding_model_verified = False

    # ------------------------------------------------------------------ LLM
    @property
    def model_name(self) -> str:
        return self.settings.llm_model

    def _config(self, system: str | None, fast: bool, **extra) -> types.GenerateContentConfig:
        thinking = types.ThinkingConfig(thinking_budget=0) if fast else None
        return types.GenerateContentConfig(system_instruction=system, temperature=0.3, thinking_config=thinking, **extra)

    def _generate(self, contents, config: types.GenerateContentConfig) -> str:
        def call() -> str:
            self.gen_limiter.acquire()
            response = self.client.models.generate_content(model=self.settings.llm_model, contents=contents, config=config)
            return response.text or ""

        return with_retries(call, is_retryable=is_retryable)

    def generate_text(self, prompt: str, *, system: str | None = None, fast: bool = False) -> LLMText:
        return LLMText(self._generate(prompt, self._config(system, fast)), self.model_name)

    def generate_json(self, prompt: str, schema: type[M], *, system: str | None = None, fast: bool = False) -> LLMJson:
        """Native structured output: the SDK turns the Pydantic model into a response schema and
        Gemini is constrained to emit matching JSON. We still validate (our validators check rules
        a schema cannot express) and repair once if needed."""
        native = self._config(system, fast, response_mime_type="application/json", response_schema=schema)

        def call(p: str) -> str:
            try:
                return self._generate(p, native)
            except genai_errors.ClientError as exc:
                if exc.code != 400:
                    raise
                # Some schema features are rejected by the API; fall back to
                # "JSON mode + schema in the prompt" and rely on our validator.
                logger.warning("native JSON schema rejected (%s); using prompt-schema mode", exc.message)
                plain = self._config(system, fast, response_mime_type="application/json")
                return self._generate(f"{p}\n\nJSON schema to follow:\n{schema_hint(schema)}", plain)

        return LLMJson(generate_validated(call, prompt, schema), self.model_name)

    def stream_text(self, prompt: str, *, system: str | None = None) -> Iterator[str]:
        self.gen_limiter.acquire()
        stream = with_retries(
            lambda: self.client.models.generate_content_stream(
                model=self.settings.llm_model, contents=prompt, config=self._config(system, fast=True)
            ),
            is_retryable=is_retryable,
        )
        for chunk in stream:
            if chunk.text:
                yield chunk.text

    def read_media(self, data: bytes, mime_type: str, instruction: str) -> LLMText:
        """OCR for images / scanned pages, transcription for audio."""
        if len(data) > MAX_INLINE_MEDIA_BYTES:
            raise ValueError("media file too large for inline OCR/transcription (max 18 MB)")
        contents = [types.Part.from_bytes(data=data, mime_type=mime_type), instruction]
        return LLMText(self._generate(contents, self._config(None, fast=True)), self.model_name)

    # ------------------------------------------------------------- Embedder
    @property
    def active_model(self) -> str:
        return self._embedding_model

    def _embed_raw(self, model: str, texts: list[str], task_type: str) -> list[list[float]]:
        def call() -> list[list[float]]:
            self.embed_limiter.acquire()
            response = self.client.models.embed_content(
                model=model,
                contents=texts,
                config=types.EmbedContentConfig(task_type=task_type, output_dimensionality=self.settings.embedding_dim),
            )
            return [l2_normalize(list(e.values or [])) for e in response.embeddings or []]

        return with_retries(call, is_retryable=is_retryable)

    def _embed(self, texts: list[str], task_type: str) -> list[list[float]]:
        """Try the configured model; if Google has retired it, switch to the fallback ONCE."""
        with self._embed_lock:
            verified = self._embedding_model_verified
            model = self._embedding_model
        if verified:
            return self._embed_raw(model, texts, task_type)
        try:
            vectors = self._embed_raw(model, texts, task_type)
        except genai_errors.ClientError as exc:
            fallback = self.settings.embedding_fallback_model
            if not fallback or exc.code not in (400, 404) or model == fallback:
                raise
            logger.warning(
                "embedding model %r unavailable (%s %s). Falling back to %r.",
                model,
                exc.code,
                exc.message,
                fallback,
            )
            model = fallback
            vectors = self._embed_raw(model, texts, task_type)
        with self._embed_lock:
            self._embedding_model = model
            self._embedding_model_verified = True
        logger.info("embedding model in use: %s (dim=%d)", model, self.settings.embedding_dim)
        return vectors

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        size = self.settings.embed_batch_size
        for start in range(0, len(texts), size):
            vectors.extend(self._embed(texts[start : start + size], "RETRIEVAL_DOCUMENT"))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], "RETRIEVAL_QUERY")[0]
