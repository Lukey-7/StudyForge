import uuid

import chromadb
import pytest
from chromadb.config import Settings as ChromaSettings
from fastapi.testclient import TestClient

from app.config import Settings
from app.db.local_repo import LocalFileStorage, LocalRepository
from app.main import create_app
from app.services import Services
from app.vector_store import ChromaVectorStore
from tests.fakes import DIM, FakeEmbedder, FakeLLM

_chroma = chromadb.EphemeralClient(settings=ChromaSettings(anonymized_telemetry=False))


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        _env_file=None,
        app_env="test",
        db_backend="memory",
        auth_mode="dev",
        local_data_dir=str(tmp_path),
        embedding_dim=DIM,
        gemini_api_key="",
        openai_api_key="",
        chunk_target_tokens=120,
        chunk_max_tokens=160,
    )


@pytest.fixture
def services(settings, tmp_path) -> Services:
    return Services(
        settings=settings,
        repo=LocalRepository(),
        storage=LocalFileStorage(str(tmp_path / "uploads")),
        llm=FakeLLM(),
        embedder=FakeEmbedder(),
        vectors=ChromaVectorStore(settings, client=_chroma),
    )


@pytest.fixture
def client(settings, services) -> TestClient:
    return TestClient(create_app(settings, services))


@pytest.fixture
def unique() -> str:
    return uuid.uuid4().hex[:8]
