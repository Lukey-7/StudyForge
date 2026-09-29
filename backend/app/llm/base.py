"""The two small interfaces the rest of the app depends on.

Everything else (ingestion, retrieval, chat, pipelines) talks to an `LLM` and an
`Embedder`, never to the Gemini SDK directly. That is why the tests can swap in
fakes and run without any API key.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol, TypeVar

from pydantic import BaseModel

M = TypeVar("M", bound=BaseModel)


@dataclass
class LLMText:
    text: str
    model: str


@dataclass
class LLMJson:
    data: BaseModel
    model: str


class LLM(Protocol):
    def generate_text(self, prompt: str, *, system: str | None = None, fast: bool = False) -> LLMText: ...

    def generate_json(self, prompt: str, schema: type[M], *, system: str | None = None, fast: bool = False) -> LLMJson: ...

    def stream_text(self, prompt: str, *, system: str | None = None) -> Iterator[str]: ...

    def read_media(self, data: bytes, mime_type: str, instruction: str) -> LLMText: ...

    @property
    def model_name(self) -> str: ...


class Embedder(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...

    @property
    def active_model(self) -> str: ...


class LLMUnavailableError(RuntimeError):
    """Raised when no configured provider could answer (quota, bad key, outage)."""
