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


# ---------------------------------------------------------------- phase 3: trust and evolution
def section_detail(client, notebook_id, section_id, version=None):
    query = f"?version={version}" if version is not None else ""
    return client.get(f"/notebooks/{notebook_id}/book/sections/{section_id}{query}")


def test_every_paragraph_is_checked_and_the_support_rate_is_reported(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    body = book(client, notebook["id"])
    assert body["support"]["rate"] == 1.0 and body["support"]["unsupported"] == 0
    assert body["job"]["llm_calls"] >= 3  # plan + (write + check) per section
    index = sections_by_title(body)["Index"]
    detail = section_detail(client, notebook["id"], index["id"]).json()
    assert detail["support_rate"] == 1.0
    assert all(p["support"] == "supported" for p in detail["paragraphs"])


def test_an_unsupported_paragraph_is_rewritten_once_then_kept_with_a_mark(client, monkeypatch):
    from app.book.schemas import SectionDraft, SupportVerdicts
    from tests import fakes

    drafts = []

    def always_unsupported(prompt):
        return SupportVerdicts.model_validate(
            {"verdicts": [{"paragraph": 0, "verdict": "unsupported", "reason": "Not in the passage."}]}
        )

    def counting_section(prompt):
        drafts.append(prompt)
        return fakes.fake_section(prompt)

    monkeypatch.setitem(fakes.BOOK_FAKES, SupportVerdicts, always_unsupported)
    monkeypatch.setitem(fakes.BOOK_FAKES, SectionDraft, counting_section)
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)

    body = book(client, notebook["id"])
    sections = sections_by_title(body)
    assert len(drafts) == 2 * len(sections)  # one draft + one rewrite per section, never more
    assert "found paragraphs not backed" in drafts[1].lower()
    first = section_detail(client, notebook["id"], sections["Index"]["id"]).json()["paragraphs"][0]
    assert first["support"] == "unsupported" and first["support_note"] == "Not in the passage."  # kept, marked
    assert body["support"]["unsupported"] >= 1 and body["support"]["rate"] < 1


def test_older_versions_of_a_section_can_be_read(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    index_id = sections_by_title(book(client, notebook["id"]))["Index"]["id"]
    before = section_detail(client, notebook["id"], index_id).json()
    upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)

    now = section_detail(client, notebook["id"], index_id).json()
    assert now["versions"] == [1, 2] and now["version"] == 2
    old = section_detail(client, notebook["id"], index_id, version=1).json()
    assert old["version"] == 1 and old["current_version"] == 2
    assert [p["text"] for p in old["paragraphs"]] == [p["text"] for p in before["paragraphs"]]
    assert section_detail(client, notebook["id"], index_id, version=7).status_code == 404

    history = client.get(f"/notebooks/{notebook['id']}/book/history").json()
    assert [h["version"] for h in history] == [2, 1]
    assert history[0]["changes"]["new_concepts"] == ["Transaction"]


def test_conflicts_are_listed_with_both_passages_and_their_section(client):
    from tests.test_knowledge import BLOG

    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    upload(client, notebook["id"], name="blog.md", data=BLOG)
    conflicts = client.get(f"/notebooks/{notebook['id']}/conflicts").json()
    assert len(conflicts) == 1
    c = conflicts[0]
    assert c["concept"]["name"] == "Index" and c["section"]["title"] == "Index"
    assert c["claim_evidence"][0]["source_name"] == "lecture.md"
    assert c["contradicting_evidence"]["source_name"] == "blog.md"
    assert sections_by_title(book(client, notebook["id"]))["Index"]["disputed"]


def test_the_daily_limit_leaves_sections_waiting(client, services):
    services.settings.book_max_sections_per_day = 1
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    body = book(client, notebook["id"])
    statuses = sorted(s["status"] for s in sections_by_title(body).values())
    assert statuses == ["current", "stale"]
    assert "daily limit" in body["job"]["detail"]


def test_one_source_can_be_re_read_without_a_full_rebuild(client, services):
    notebook = make_notebook(client)
    source = upload(client, notebook["id"], name="lecture.md", data=LECTURE)["source"]
    assert client.post(f"/sources/{source['id']}/knowledge/retry").status_code == 202
    km = client.get(f"/notebooks/{notebook['id']}/knowledge").json()
    assert km["job"]["status"] == "done" and km["job"]["llm_calls"] >= 1


def test_a_concept_placed_into_an_existing_section_is_saved_there(client, monkeypatch):
    from app.book.schemas import Placement
    from tests import fakes

    def into_first_section(prompt):
        return Placement.model_validate(
            {"placements": [{"concept": 0, "section": 0, "chapter": 0, "new_section_title": "", "new_chapter_title": ""}]}
        )

    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    monkeypatch.setitem(fakes.BOOK_FAKES, Placement, into_first_section)
    upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)  # Transaction goes into an existing section

    body = book(client, notebook["id"])
    assert "Transaction" not in sections_by_title(body)  # no section of its own
    client.post(f"/notebooks/{notebook['id']}/book/write")
    again = book(client, notebook["id"])
    assert again["version"] == body["version"]
    first = again["chapters"][0]["sections"][0]
    concepts = client.get(f"/notebooks/{notebook['id']}/book/sections/{first['id']}").json()["concepts"]
    assert "Transaction" in [c["name"] for c in concepts]  # stored in that section, not "new" on every sync
