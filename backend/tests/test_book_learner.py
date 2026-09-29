"""Phases 4 and 5 of the living textbook: figures, export, and the learner in the loop
(read marks, chapter quiz scores and weak spots, explanations, ask the book, cross-notebook search)."""

import io
import zipfile

from app.book.figures import chapter_map, comparisons
from app.knowledge.schemas import Extraction
from tests.test_api import make_notebook, parse_sse, upload
from tests.test_book import book, sections_by_title
from tests.test_knowledge import LECTURE, TEXTBOOK

CONCEPTS = {
    "b": {"id": "b", "name": "B+ tree", "definition": "A balanced tree."},
    "h": {"id": "h", "name": 'Hash "index"', "definition": "A bucket lookup."},
    "i": {"id": "i", "name": "Index", "definition": "Speeds up reads."},
}
LINKS = [
    {"from_id": "b", "to_id": "i", "kind": "part_of"},
    {"from_id": "b", "to_id": "h", "kind": "contrasts_with"},
]


# ---------------------------------------------------------------- phase 4: figures and export
def test_a_chapter_map_is_mermaid_drawn_from_the_links():
    source = chapter_map(["b", "h", "i"], CONCEPTS, LINKS)
    assert source.startswith("flowchart TD")
    assert "-->|part of|" in source and "-->|contrasts with|" in source
    assert '"Hash  index"' in source  # quotes cannot break the Mermaid label
    assert chapter_map(["i"], CONCEPTS, LINKS) is None  # nothing to draw


def test_contrasting_concepts_become_a_comparison_table():
    tables = comparisons(["b"], CONCEPTS, LINKS, {"b": ["Leaves are linked."]})
    assert len(tables) == 1
    assert [c["name"] for c in tables[0]["columns"]] == ["B+ tree", 'Hash "index"']
    assert tables[0]["columns"][0]["facts"] == ["Leaves are linked."]
    assert comparisons(["i"], CONCEPTS, LINKS, {}) == []


def test_the_book_exports_as_markdown_with_footnotes_and_as_epub(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)

    md = client.get(f"/notebooks/{notebook['id']}/book/export?format=md")
    assert md.status_code == 200 and 'filename="dbms.md"' in md.headers["content-disposition"]
    text = md.text
    assert text.startswith("# DBMS") and "## 1. Basics" in text and "## Glossary" in text
    assert "[^1]: lecture.md" in text

    epub = client.get(f"/notebooks/{notebook['id']}/book/export?format=epub")
    assert epub.headers["content-type"] == "application/epub+zip"
    z = zipfile.ZipFile(io.BytesIO(epub.content))
    first = z.infolist()[0]
    assert first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED
    assert {"META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/chapter1.xhtml"} <= set(z.namelist())
    assert "lecture.md" in z.read("OEBPS/notes.xhtml").decode()


def test_the_book_carries_chapter_maps(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)  # fake extraction links B-tree part_of Index
    chapter = book(client, notebook["id"])["chapters"][0]
    assert chapter["map"] and "part of" in chapter["map"]


# ---------------------------------------------------------------- phase 5: the learner in the loop
def test_read_marks_give_reading_progress(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    body = book(client, notebook["id"])
    assert body["progress"]["read"] == 0 and body["progress"]["total"] == len(sections_by_title(body))
    index = sections_by_title(body)["Index"]
    client.post(f"/notebooks/{notebook['id']}/book/sections/{index['id']}/read", json={"read": True})
    after = book(client, notebook["id"])
    assert after["progress"]["read"] == 1 and sections_by_title(after)["Index"]["read"]
    client.post(f"/notebooks/{notebook['id']}/book/sections/{index['id']}/read", json={"read": False})
    assert book(client, notebook["id"])["progress"]["read"] == 0


def test_a_weak_chapter_quiz_becomes_a_weak_spot(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    url = f"/notebooks/{notebook['id']}/book/quiz-result"
    assert client.post(url, json={"chapter": "Basics", "score": 2, "total": 5}).status_code == 200
    spots = book(client, notebook["id"])["weak_spots"]
    assert [(s["chapter"], s["score"], s["total"]) for s in spots] == [("Basics", 2, 5)]
    client.post(url, json={"chapter": "Basics", "score": 5, "total": 5})
    assert book(client, notebook["id"])["weak_spots"] == []
    assert client.post(url, json={"chapter": "Basics", "score": 6, "total": 5}).status_code == 422


def test_a_section_can_be_explained_differently(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    index = sections_by_title(book(client, notebook["id"]))["Index"]
    r = client.post(f"/notebooks/{notebook['id']}/book/sections/{index['id']}/explain", json={"style": "steps"})
    assert r.status_code == 200 and r.json()["style"] == "steps" and r.json()["text"]
    assert client.post(f"/notebooks/{notebook['id']}/book/sections/nope/explain", json={}).status_code == 404


def test_chat_can_cite_the_book(client, services):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    services.llm.answer = "An index speeds up reads [S1][B1]."
    events = parse_sse(client.post(f"/notebooks/{notebook['id']}/chat", json={"message": "Why use an index?"}).text)
    meta, done = events[0][1], events[-1][1]
    book_cites = [c for c in meta["citations"] if c.get("kind") == "book"]
    assert book_cites and book_cites[0]["label"] == "B1" and book_cites[0]["source_name"].startswith("Book: ")
    assert {c["label"] for c in done["citations"]} == {"S1", "B1"}  # only what the answer cited


def test_search_spans_notebooks_but_never_other_users(client, services):
    first = make_notebook(client, title="DBMS")
    second = make_notebook(client, title="More DBMS")
    upload(client, first["id"], name="lecture.md", data=LECTURE)
    upload(client, second["id"], name="textbook.md", data=TEXTBOOK)
    stranger = services.repo.create_notebook("someone-else", "Private", None)
    services.repo.insert(
        "concepts", {"notebook_id": stranger["id"], "user_id": "someone-else", "name": "Index", "definition": "Secret index."}
    )

    results = client.get("/search?q=index").json()
    notebooks = {r["notebook"]["title"] for r in results}
    assert notebooks == {"DBMS", "More DBMS"}
    assert {"concept", "section"} <= {r["kind"] for r in results}
    assert all("Secret" not in r["snippet"] for r in results)
    assert client.get("/search?q=a").status_code == 422


# ---------------------------------------------------------------- timelines, charts, search by meaning
def test_timelines_and_charts_are_drawn_from_stated_dates_and_numbers():
    from app.book.figures import chapter_timeline, chart_data

    events = [
        {"concept_id": "i", "year": 1979, "date_text": "1979", "event": "Oracle: first commercial SQL database"},
        {"concept_id": "i", "year": 1970, "date_text": "1970", "event": "Codd publishes the relational model"},
        {"concept_id": "x", "year": 1990, "date_text": "1990", "event": "not in this chapter"},
    ]
    source = chapter_timeline(["i"], events)
    assert source.splitlines()[0] == "timeline"
    assert source.index("1970") < source.index("1979") and "1990" not in source
    assert "Oracle - first" in source  # ':' would end the entry in Mermaid's timeline syntax
    assert chapter_timeline(["i"], events[:1]) is None  # one date is not a timeline

    table = {"id": "t", "title": "Page reads", "chunk_id": "c", "columns": ["Method", "Reads", "Note"],
             "rows": [["Full scan", "10,000", "slow"], ["B+ tree", "4", "fast"]]}  # fmt: skip
    series = chart_data(table)["series"]
    assert series == {"column": "Reads", "labels": ["Full scan", "B+ tree"], "values": [10000.0, 4.0]}
    assert chart_data({**table, "rows": [["a", "x", "y"], ["b", "z", "w"]]})["series"] is None


def test_dated_events_and_number_tables_reach_the_book(client, services):
    extraction = (
        '{"concepts": [{"name": "Index", "kind": "term", "definition": "Speeds up reads.", "aliases": [], "passage": 0}],'
        ' "claims": [{"concept": "Index", "text": "An index speeds up reads on large tables.", "passage": 0}], "links": [],'
        ' "events": [{"concept": "Index", "date": "1970", "year": 1970, "event": "B-trees are described", "passage": 0},'
        '            {"concept": "Index", "date": "1972", "year": 1972, "event": "B-trees are published", "passage": 0}],'
        ' "tables": [{"concept": "Index", "title": "Page reads per lookup", "columns": ["Method", "Reads"],'
        '             "rows": [["Full scan", "10000"], ["B+ tree", "4"]], "passage": 0}]}'
    )
    services.llm.json_outputs[Extraction] = [extraction]
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    body = book(client, notebook["id"])
    assert "B-trees are described" in body["chapters"][0]["timeline"]
    index = sections_by_title(body)["Index"]
    charts = client.get(f"/notebooks/{notebook['id']}/book/sections/{index['id']}").json()["charts"]
    assert charts[0]["series"]["values"] == [10000.0, 4.0] and charts[0]["evidence"]["source_name"] == "lecture.md"


def test_search_and_ask_the_book_work_by_meaning_not_only_words(client, services, monkeypatch):
    from app.book import learner

    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    services.settings.book_search_min_similarity = 0.2
    monkeypatch.setattr(learner, "words", lambda text: [])  # no word matches at all: only embeddings can find it
    results = client.get("/search?q=index speeds up reads").json()
    assert results and results[0]["notebook"]["id"] == notebook["id"]
    text, citations = learner.book_context(services, notebook["id"], "index speeds up reads")
    assert citations and citations[0]["label"] == "B1"


def test_written_sections_are_embedded_once(client, services):
    from app.book.sync import index_sections

    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    sections = services.repo.select("book_sections", notebook_id=notebook["id"])
    assert sections and all(s["indexed"] for s in sections)
    assert index_sections(services, notebook["id"]) == 0  # nothing left to embed


def test_long_figure_labels_are_cut_at_a_word():
    from app.book.figures import _label

    text = "Oracle released the first commercial relational database that used SQL in its product line"
    assert _label(text, 60) == "Oracle released the first commercial relational database…"
    assert _label("short") == "short"
