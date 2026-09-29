"""The book: written from the knowledge model after every change, only stale sections rewritten,
versions and "since you last read". Uses FakeLLM's rule-based outline/placement/sections."""

from app.book.outline import order_outline
from tests.test_api import make_notebook, upload
from tests.test_knowledge import LECTURE, TEXTBOOK


def book(client, notebook_id):
    return client.get(f"/notebooks/{notebook_id}/book").json()


def sections_by_title(body):
    return {s["title"]: s for ch in body["chapters"] for s in ch["sections"]}


def test_prerequisites_come_first_and_the_planner_order_is_kept_otherwise():
    sections = [
        {"chapter_title": "A", "title": "Trees", "concept_ids": ["tree"]},
        {"chapter_title": "A", "title": "Misc", "concept_ids": ["misc"]},
        {"chapter_title": "A", "title": "Keys", "concept_ids": ["key"]},
    ]
    links = [{"from_id": "tree", "to_id": "key", "kind": "requires"}]
    assert [s["title"] for s in order_outline(sections, links)] == ["Misc", "Keys", "Trees"]


def test_a_new_notebook_gets_a_book_with_cited_sections(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    body = book(client, notebook["id"])
    sections = sections_by_title(body)
    assert body["version"] == 1 and body["job"]["status"] == "done"
    assert {"Index", "B-tree"} <= set(sections)
    assert all(s["status"] == "current" for s in sections.values())

    detail = client.get(f"/notebooks/{notebook['id']}/book/sections/{sections['Index']['id']}").json()
    assert detail["concepts"][0]["name"] == "Index"
    assert detail["paragraphs"] and detail["paragraphs"][0]["evidence"][0]["source_name"] == "lecture.md"


def test_adding_a_source_rewrites_only_the_sections_it_touches(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    first = book(client, notebook["id"])  # the reader has now seen version 1
    assert first["changes"]["revised"] == [] and first["changes"]["new_concepts"] == []

    upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)
    body = book(client, notebook["id"])
    sections = sections_by_title(body)
    assert body["version"] == 2
    assert sections["B-tree"]["version"] == 1  # the textbook says nothing about B-trees
    assert sections["Index"]["version"] == 2 and sections["Index"]["revised"]
    assert sections["Transaction"]["version"] == 2
    assert body["changes"]["new_concepts"] == ["Transaction"]
    assert [s["title"] for s in body["changes"]["revised"]] == ["Index"]
    assert [s["title"] for s in body["changes"]["added"]] == ["Transaction"]

    index = client.get(f"/notebooks/{notebook['id']}/book/sections/{sections['Index']['id']}").json()
    assert {e["source_name"] for p in index["paragraphs"] for e in p["evidence"]} == {"lecture.md", "textbook.md"}

    assert client.post(f"/notebooks/{notebook['id']}/book/seen").json() == {"last_seen_version": 2}
    after = book(client, notebook["id"])
    assert after["changes"]["revised"] == [] and not sections_by_title(after)["Index"]["revised"]


def test_nothing_is_rewritten_when_nothing_changed(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    assert client.post(f"/notebooks/{notebook['id']}/book/write").status_code == 202
    body = book(client, notebook["id"])
    assert body["version"] == 1 and body["job"]["detail"] == "The book is up to date"


def test_removing_a_source_removes_its_sections_and_rewrites_the_shared_ones(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    textbook = upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)["source"]
    book(client, notebook["id"])

    client.delete(f"/sources/{textbook['id']}")
    body = book(client, notebook["id"])
    sections = sections_by_title(body)
    assert "Transaction" not in sections
    assert body["version"] == 3 and sections["Index"]["version"] == 3
    assert body["changes"]["removed"] == ["Transaction"]


def test_other_users_book_is_404(client, services):
    stranger = services.repo.create_notebook("someone-else", "Private", None)
    assert client.get(f"/notebooks/{stranger['id']}/book").status_code == 404
    mine = make_notebook(client)
    assert client.get(f"/notebooks/{mine['id']}/book/sections/nope").status_code == 404


def test_the_first_edition_is_not_reported_as_changes(client):
    notebook = make_notebook(client)
    assert book(client, notebook["id"])["version"] == 0  # opened before any source was added
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    body = book(client, notebook["id"])
    assert body["last_seen_version"] == 1 and body["changes"]["added"] == []


def test_a_rebuild_keeps_the_outline_and_rewrites_nothing(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    before = sections_by_title(book(client, notebook["id"]))
    client.post(f"/notebooks/{notebook['id']}/knowledge/rebuild")
    body = book(client, notebook["id"])
    after = sections_by_title(body)
    assert {t: s["id"] for t, s in after.items()} == {t: s["id"] for t, s in before.items()}  # same concepts, same sections
    assert body["version"] == 1


def test_concepts_without_evidence_are_left_out_of_the_book(client, services):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    # what an interrupted build leaves behind: a concept whose claims were never saved
    services.repo.insert(
        "concepts",
        {"notebook_id": notebook["id"], "user_id": notebook["user_id"], "name": "Orphan", "definition": "Unsupported."},
    )
    client.post(f"/notebooks/{notebook['id']}/book/write")
    assert "Orphan" not in sections_by_title(book(client, notebook["id"]))


def test_a_stale_supabase_connection_is_retried_once(monkeypatch):
    import httpx

    from app.db.supabase_repo import RetryStaleConnection

    calls = []

    def flaky(self, request):
        calls.append(request.url.path)
        if len(calls) == 1:
            raise httpx.RemoteProtocolError("Server disconnected")
        return httpx.Response(200, json=[])

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", flaky)
    with httpx.Client(transport=RetryStaleConnection()) as http:
        assert http.get("https://example.supabase.co/rest/v1/claims").status_code == 200
    assert calls == ["/rest/v1/claims", "/rest/v1/claims"]


def test_a_section_added_and_then_rewritten_counts_once_as_new(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    book(client, notebook["id"])  # seen: version 1
    upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)  # adds Transaction (v2)
    upload(client, notebook["id"], name="more.md", data=b"# More\n\nA transaction has a begin and an end.\n")  # rewrites it (v3)
    changes = book(client, notebook["id"])["changes"]
    assert "Transaction" in [s["title"] for s in changes["added"]]
    assert "Transaction" not in [s["title"] for s in changes["revised"]]
