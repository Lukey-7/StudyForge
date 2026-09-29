"""End-to-end API tests with the fake LLM/embedder (no API keys, no network)."""

import json

import pytest

from app.generation.registry import PIPELINES

DOC = """# Database Indexing

A B-tree index keeps keys sorted so lookups take logarithmic time. Indexes speed up reads
but slow down writes because every insert must also update the index.

# Transactions

Transactions follow the ACID properties: atomicity, consistency, isolation and durability.
Atomicity means a transaction happens completely or not at all.
"""


def make_notebook(client, title="DBMS") -> dict:
    response = client.post("/notebooks", json={"title": title})
    assert response.status_code == 201
    return response.json()


def upload(client, notebook_id, name="notes.md", data: bytes = DOC.encode()) -> dict:
    response = client.post(f"/notebooks/{notebook_id}/sources", files={"file": (name, data, "text/markdown")})
    assert response.status_code in (200, 202), response.text
    return response.json()


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for frame in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in frame.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["embedding_model"] == "fake-embedding"


def test_notebook_crud(client):
    notebook = make_notebook(client)
    assert client.get("/notebooks").json()[0]["id"] == notebook["id"]
    assert client.patch(f"/notebooks/{notebook['id']}", json={"title": "Renamed"}).json()["title"] == "Renamed"
    assert client.delete(f"/notebooks/{notebook['id']}").status_code == 204
    assert client.get(f"/notebooks/{notebook['id']}").status_code == 404


def test_other_users_notebook_is_404(client, services):
    stranger = services.repo.create_notebook("someone-else", "Private", None)
    assert client.get(f"/notebooks/{stranger['id']}").status_code == 404


def test_upload_ingests_to_ready_and_is_idempotent(client, services):
    notebook = make_notebook(client)
    first = upload(client, notebook["id"])
    assert first["duplicate"] is False
    # TestClient runs BackgroundTasks before returning, so ingestion is done.
    source = client.get(f"/sources/{first['source']['id']}").json()
    assert source["status"] == "ready", source["error_message"]
    assert source["chunk_count"] >= 1
    assert source["embedding_model"] == "fake-embedding"
    chunks_before = services.repo.list_chunks(notebook["id"])

    second = upload(client, notebook["id"])
    assert second["duplicate"] is True
    assert second["source"]["id"] == first["source"]["id"]
    assert len(services.repo.list_chunks(notebook["id"])) == len(chunks_before)
    assert services.vectors.count("fake-embedding", notebook["id"]) == len(chunks_before)


def test_retry_does_not_duplicate_vectors(client, services):
    notebook = make_notebook(client)
    source = upload(client, notebook["id"])["source"]
    count = services.vectors.count("fake-embedding", notebook["id"])
    assert client.post(f"/sources/{source['id']}/retry").status_code == 202
    assert services.vectors.count("fake-embedding", notebook["id"]) == count


def test_unsupported_file_type_is_rejected(client):
    notebook = make_notebook(client)
    response = client.post(f"/notebooks/{notebook['id']}/sources", files={"file": ("virus.exe", b"MZ", "application/x")})
    assert response.status_code == 422


def test_delete_source_removes_chunks_and_vectors(client, services):
    notebook = make_notebook(client)
    source = upload(client, notebook["id"])["source"]
    assert client.delete(f"/sources/{source['id']}").status_code == 204
    assert services.repo.list_chunks(notebook["id"]) == []
    assert services.vectors.count("fake-embedding", notebook["id"]) == 0


def test_search_returns_every_layer_and_citations(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"])
    body = client.post(f"/notebooks/{notebook['id']}/search", json={"query": "ACID atomicity"}).json()
    assert set(body["layers"]) >= {"dense", "bm25", "fused", "mmr"}
    assert body["citations"][0]["label"] == "S1"
    assert "atomicity" in body["context"].lower()


def test_generate_requires_ready_sources(client):
    notebook = make_notebook(client)
    response = client.post(f"/notebooks/{notebook['id']}/generate/summary", json={})
    assert response.status_code == 409


def test_unknown_pipeline_is_404(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"])
    assert client.post(f"/notebooks/{notebook['id']}/generate/nope", json={}).status_code == 404


@pytest.mark.parametrize("pipeline", [p.name for p in PIPELINES])
def test_every_pipeline_generates_and_caches(client, pipeline):
    notebook = make_notebook(client)
    upload(client, notebook["id"])
    first = client.post(f"/notebooks/{notebook['id']}/generate/{pipeline}", json={"difficulty": "beginner"})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["cached"] is False and body["model"] == "fake-llm"
    assert body["output"]["_meta"]["strategy"] in ("whole_notebook_map_reduce", "top_k_for_topic", "per_source")
    if pipeline == "mind_map":
        assert body["output"]["mermaid"].startswith("mindmap")

    again = client.post(f"/notebooks/{notebook['id']}/generate/{pipeline}", json={"difficulty": "beginner"})
    assert again.json()["cached"] is True and again.json()["id"] == body["id"]


def test_new_source_invalidates_generation_cache(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"])
    first = client.post(f"/notebooks/{notebook['id']}/generate/summary", json={}).json()
    upload(
        client,
        notebook["id"],
        name="more.md",
        data=b"# Extra\n\nNew content about hashing and hash indexes for equality lookups.",
    )
    second = client.post(f"/notebooks/{notebook['id']}/generate/summary", json={}).json()
    assert second["cached"] is False and second["id"] != first["id"]


def test_chat_streams_tokens_with_citations_and_persists(client, services):
    notebook = make_notebook(client)
    upload(client, notebook["id"])
    response = client.post(f"/notebooks/{notebook['id']}/chat", json={"message": "How do indexes affect writes?"})
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    names = [name for name, _ in events]
    assert names[0] == "meta" and names[-1] == "done" and "token" in names
    meta, done = events[0][1], events[-1][1]
    assert meta["citations"], "retrieval should find context"
    assert [c["label"] for c in done["citations"]] == ["S1"]  # fake answer cites [S1] only

    messages = client.get(f"/chat/sessions/{done['session_id']}/messages").json()
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[1]["citations"][0]["label"] == "S1"


def test_follow_up_question_is_rewritten(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"])
    first = parse_sse(client.post(f"/notebooks/{notebook['id']}/chat", json={"message": "What is a B-tree?"}).text)
    session_id = first[-1][1]["session_id"]
    follow = parse_sse(
        client.post(
            f"/notebooks/{notebook['id']}/chat", json={"message": "what about its disadvantages?", "session_id": session_id}
        ).text
    )
    assert follow[0][1]["rewritten_query"] == "What are the disadvantages of B-tree indexes?"


def test_chat_without_sources_says_so(client):
    notebook = make_notebook(client)
    events = parse_sse(client.post(f"/notebooks/{notebook['id']}/chat", json={"message": "hello?"}).text)
    text = "".join(d["text"] for name, d in events if name == "token")
    assert "couldn't find" in text


def test_overview_lists_notebooks_recent_work_and_totals(client):
    empty = client.get("/me/overview").json()
    assert empty["totals"]["notebooks"] == 0 and empty["recent_generations"] == []

    notebook = make_notebook(client, title="Operating systems")
    upload(client, notebook["id"])
    client.post(f"/notebooks/{notebook['id']}/generate/quiz", json={})
    parse_sse(client.post(f"/notebooks/{notebook['id']}/chat", json={"message": "What is a B-tree?"}).text)

    body = client.get("/me/overview").json()
    assert body["totals"] == {"notebooks": 1, "sources": 1, "ready_sources": 1, "generations": 1}
    assert body["notebooks"][0]["title"] == "Operating systems"
    made = body["recent_generations"][0]
    assert made["pipeline_name"] == "quiz" and made["notebook_title"] == "Operating systems"
    assert "output" not in made  # the list stays light; the output is fetched when opened
    assert body["recent_chats"][0]["title"].startswith("What is a B-tree")


def test_overview_never_shows_other_users_work(client, services):
    stranger = services.repo.create_notebook("someone-else", "Private", None)
    services.repo.create_chat_session({"notebook_id": stranger["id"], "user_id": "someone-else", "title": "secret"})
    body = client.get("/me/overview").json()
    assert all(n["title"] != "Private" for n in body["notebooks"])
    assert all(c["title"] != "secret" for c in body["recent_chats"])
