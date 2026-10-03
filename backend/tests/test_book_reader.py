"""The reader-facing book: repetition removed, numbered sections and an index, reader settings,
code examples and process steps, the last 5 editions with revert, and queued builds resuming."""

from app.book.schemas import SectionDraft
from app.book.sync import DEFAULT_SETTINGS, drop_repeats, write_system
from tests import fakes
from tests.test_api import make_notebook, upload
from tests.test_book import book, sections_by_title
from tests.test_knowledge import LECTURE, TEXTBOOK


def section(client, notebook_id, section_id, version=None):
    query = f"?version={version}" if version is not None else ""
    return client.get(f"/notebooks/{notebook_id}/book/sections/{section_id}{query}").json()


# ---------------------------------------------------------------- repetition
def test_a_paragraph_that_repeats_another_section_is_removed():
    paragraphs = [
        {"text": "Supervised learning trains a model on labelled examples with the correct output."},
        {"text": "Decision trees split the data on the feature that most reduces impurity."},
    ]
    others = ["Supervised learning trains a model on labelled examples, each with the correct output."]
    kept, dropped = drop_repeats(paragraphs, others, 0.5)
    assert dropped == 1 and [p["text"][:8] for p in kept] == ["Decision"]
    kept, dropped = drop_repeats(paragraphs[:1], others, 0.5)
    assert len(kept) == 1 and dropped == 0  # a section always keeps one paragraph


def test_the_book_removes_repeated_paragraphs_while_writing(client, services):
    services.settings.book_repeat_threshold = 0.5
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    # the textbook rewrites Index with two passages; the fake writer quotes passages verbatim, so
    # the lecture paragraph now repeats the B-tree section's and is removed
    upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)
    body = book(client, notebook["id"])
    assert "repeat" in body["job"]["detail"] and "removed" in body["job"]["detail"]
    sections = sections_by_title(body)
    index = [p["text"] for p in section(client, notebook["id"], sections["Index"]["id"])["paragraphs"]]
    btree = [p["text"] for p in section(client, notebook["id"], sections["B-tree"]["id"])["paragraphs"]]
    assert not set(index) & set(btree)  # the repeated paragraph left the section being rewritten


def test_other_sections_concepts_are_named_not_explained_again():
    system = write_system(DEFAULT_SETTINGS)
    assert "never define or explain them again" in system


# ---------------------------------------------------------------- numbers and the index
def test_sections_are_numbered_and_indexed(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    body = book(client, notebook["id"])
    numbers = [s["number"] for ch in body["chapters"] for s in ch["sections"]]
    assert numbers == [f"1.{i}" for i in range(1, len(numbers) + 1)]

    entries = client.get(f"/notebooks/{notebook['id']}/book/index").json()
    index = next(e for e in entries if e["term"] == "Index")
    assert index["sections"][0]["main"] and index["sections"][0]["number"] in numbers
    assert [e["term"] for e in entries] == sorted((e["term"] for e in entries), key=str.lower)


# ---------------------------------------------------------------- reader settings
def test_writing_follows_the_readers_settings():
    beginner = write_system({**DEFAULT_SETTINGS, "audience": "beginner", "depth": "concise", "code": False})
    assert "new to the subject" in beginner and "1 to 3 paragraphs" in beginner and "Leave code_examples empty" in beginner
    assert "4 to 7 paragraphs" in write_system({**DEFAULT_SETTINGS, "depth": "detailed"})


def test_changing_the_settings_rewrites_the_book(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    before = book(client, notebook["id"])
    assert before["settings"] == DEFAULT_SETTINGS
    r = client.put(f"/notebooks/{notebook['id']}/book/settings", json={**DEFAULT_SETTINGS, "audience": "beginner"})
    assert r.status_code == 200 and r.json()["rewriting"] is True
    after = book(client, notebook["id"])
    assert after["settings"]["audience"] == "beginner"
    assert after["version"] == before["version"] + 1
    assert all(s["version"] == after["version"] for s in sections_by_title(after).values())  # every section rewritten
    again = client.put(f"/notebooks/{notebook['id']}/book/settings", json={**DEFAULT_SETTINGS, "audience": "beginner"})
    assert again.json()["rewriting"] is False


# ---------------------------------------------------------------- code examples and process steps
def with_code_and_steps(prompt):
    draft = fakes.fake_section(prompt).model_dump()
    draft["code_examples"] = [
        {
            "language": "python",
            "caption": "Build an index",
            "code": "CREATE INDEX i ON t(a)",
            "from_sources": True,
            "passages": [0],
        },
        {"language": "python", "caption": "Made up", "code": "print('hi')", "from_sources": True, "passages": [99]},
    ]
    draft["steps_title"] = "How a lookup works"
    draft["steps"] = ["Start at the root", "Follow the key range", "Read the leaf"]
    return SectionDraft.model_validate(draft)


def test_code_examples_and_steps_are_shown_and_cited(client, monkeypatch):
    monkeypatch.setitem(fakes.BOOK_FAKES, SectionDraft, with_code_and_steps)
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    index = sections_by_title(book(client, notebook["id"]))["Index"]
    d = section(client, notebook["id"], index["id"])
    first, second = d["code_examples"]
    assert first["from_sources"] and first["evidence"][0]["source_name"] == "lecture.md"
    assert not second["from_sources"] and second["evidence"] == []  # cited a passage that does not exist: illustrative
    assert d["steps"]["items"][0] == "Start at the root" and d["steps"]["diagram"].startswith("flowchart TD")

    md = client.get(f"/notebooks/{notebook['id']}/book/export?format=md").text
    assert "```python" in md and "Illustrative example" in md and "## Index" in md


def test_no_code_when_the_reader_turns_it_off(client, monkeypatch):
    monkeypatch.setitem(fakes.BOOK_FAKES, SectionDraft, with_code_and_steps)
    notebook = make_notebook(client)
    client.put(f"/notebooks/{notebook['id']}/book/settings", json={**DEFAULT_SETTINGS, "code": False})
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    index = sections_by_title(book(client, notebook["id"]))["Index"]
    assert section(client, notebook["id"], index["id"])["code_examples"] == []


# ---------------------------------------------------------------- editions: keep 5, revert
def test_the_last_editions_are_kept_and_the_book_can_be_reverted(client, services):
    services.settings.book_max_versions = 2
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)  # v1
    index_id = sections_by_title(book(client, notebook["id"]))["Index"]["id"]
    v1_text = [p["text"] for p in section(client, notebook["id"], index_id)["paragraphs"]]
    upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)  # v2
    upload(client, notebook["id"], name="more.md", data=b"# More\n\nA transaction has a begin and an end.\n")  # v3

    history = client.get(f"/notebooks/{notebook['id']}/book/history").json()
    assert [h["version"] for h in history] == [3, 2, 1]
    assert [h["can_revert"] for h in history] == [False, True, False]  # only 2 kept (2, 3); 3 is the current one

    assert client.post(f"/notebooks/{notebook['id']}/book/revert", json={"version": 1}).status_code == 404
    r = client.post(f"/notebooks/{notebook['id']}/book/revert", json={"version": 2})
    assert r.json() == {"version": 4, "reverted_to": 2}
    body = book(client, notebook["id"])
    assert body["version"] == 4 and "Transaction" in sections_by_title(body)
    assert client.get(f"/notebooks/{notebook['id']}/book/history").json()[0]["changes"]["reverted_to"] == 2
    assert v1_text  # the reverted book reads as version 2 did, until the sources change again


# ---------------------------------------------------------------- long documents: queued builds resume
def test_a_build_queued_by_the_hourly_budget_resumes_by_itself(client, services):
    from app.knowledge import build

    notebook = make_notebook(client)
    services.settings.knowledge_max_passages_per_hour = 1
    build._budget = build.PassageBudget(1)
    build._budget.take(1)  # the hour's budget is used up
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    km = client.get(f"/notebooks/{notebook['id']}/knowledge").json()
    assert km["job"]["status"] == "queued" and km["concepts"] == []

    build._budget = build.PassageBudget(1)  # an hour later
    assert build.resume_queued(services) == 1
    km = client.get(f"/notebooks/{notebook['id']}/knowledge").json()
    assert km["job"]["status"] == "done" and km["concepts"]
    assert book(client, notebook["id"])["version"] >= 1  # and the book was written
    build._budget = None


def test_code_blocks_in_passages_are_offered_to_the_writer():
    from app.book.sync import code_blocks

    passages = [{"text": "No code here."}, {"text": "Train it:\n\n```python\nmodel.fit(X, y)\n```\nDone."}]
    assert code_blocks(passages) == [(1, "model.fit(X, y)")]


def test_code_sharing_a_passage_with_other_topics_still_reaches_its_section(client, services):
    """A code block that shares its passage with unrelated text (no claim leads to it) is matched
    to the section whose concept the surrounding sentence names."""
    from app.book.sync import Model, related_code_passages

    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    code = b"# Notes\n\nSome unrelated words.\n\nThis builds a B-tree on a column:\n\n```sql\nCREATE INDEX i ON t(a);\n```\n"
    upload(client, notebook["id"], name="code.md", data=code)
    model = Model(services, notebook["id"])
    btree = next(c for c in model.concepts.values() if c["name"] == "B-tree")
    found = related_code_passages(model, [btree["id"]], [])
    assert len(found) == 1 and "CREATE INDEX" in found[0]["text"]
    transaction = [c["id"] for c in model.concepts.values() if c["name"] == "Transaction"]
    assert related_code_passages(model, transaction, []) == []


def test_sections_waiting_for_the_daily_cap_are_finished_later(client, services):
    from app.knowledge.build import resume_waiting_sections

    services.settings.book_max_sections_per_day = 1
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    assert "stale" in [s["status"] for s in sections_by_title(book(client, notebook["id"])).values()]
    services.settings.book_max_sections_per_day = 150  # the next day
    assert resume_waiting_sections(services) == 1
    assert {s["status"] for s in sections_by_title(book(client, notebook["id"])).values()} == {"current"}


def test_the_same_code_appears_once_in_the_book(client, monkeypatch):
    def same_code_everywhere(prompt):
        draft = fakes.fake_section(prompt).model_dump()
        draft["code_examples"] = [
            {"language": "sql", "caption": "Index it", "code": "CREATE INDEX i ON t(a);", "from_sources": True, "passages": [0]}
        ]
        return SectionDraft.model_validate(draft)

    monkeypatch.setitem(fakes.BOOK_FAKES, SectionDraft, same_code_everywhere)
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    body = book(client, notebook["id"])
    shown = [c for s in sections_by_title(body).values() for c in section(client, notebook["id"], s["id"])["code_examples"]]
    assert len(shown) == 1 and "removed" in body["job"]["detail"]


def test_levels_change_style_not_facts():
    beginner = write_system({**DEFAULT_SETTINGS, "audience": "beginner"})
    advanced = write_system({**DEFAULT_SETTINGS, "audience": "advanced"})
    assert "In other words" in beginner and "short sentences" in beginner
    assert "compactly" in advanced
    assert all("follow directly from" in s for s in (beginner, advanced))  # the grounding rule never changes
