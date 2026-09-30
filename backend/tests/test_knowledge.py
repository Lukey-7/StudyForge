"""The knowledge model: concept merging, duplicate claims as extra evidence, contradictions as
conflicts, clean-up when a source is removed. Uses FakeLLM's rule-based extraction/verdicts."""

from app.knowledge.build import PassageBudget
from app.knowledge.schemas import Extraction
from app.knowledge.triage import decide_claim, match_concept, normalise
from tests.test_api import make_notebook, upload

LECTURE = b"""# Indexing

An index speeds up reads on large tables. A B-tree keeps keys sorted.
"""
TEXTBOOK = b"""# Chapter 4

An index speeds up reads on large tables. Transactions follow the ACID properties.
"""
BLOG = b"""# A hot take

An index never speeds up reads on large tables.
"""


def knowledge(client, notebook_id):
    return client.get(f"/notebooks/{notebook_id}/knowledge").json()


def concept_named(body, name):
    return next(c for c in body["concepts"] if c["name"] == name)


# ---------------------------------------------------------------- pure rules
def test_names_normalise_to_one_key():
    assert normalise("Indexes") == normalise("index") == "index"
    assert normalise("B+  Trees") == normalise("b+ tree")
    assert normalise("Replacement policies") == "replacement policy"
    assert normalise("ACID") == "acid"


def test_match_concept_uses_names_and_aliases():
    known = {"b-tree": "c1", "balanced tree": "c1"}
    assert match_concept("B-trees", [], known) == "c1"
    assert match_concept("Something", ["Balanced tree"], known) == "c1"
    assert match_concept("Hash index", [], known) is None


def test_claim_decisions():
    t = 0.8
    assert decide_claim([], t) == ("new", None)  # nothing to compare with
    assert decide_claim([("c1", 0.5, "same")], t) == ("new", None)  # too far apart to be the same fact
    assert decide_claim([("c1", 0.95, "same")], t) == ("duplicate", "c1")
    assert decide_claim([("c1", 0.95, "unrelated")], t) == ("new", None)
    # the closest neighbour is unrelated but the second one contradicts: that is a conflict
    assert decide_claim([("c1", 0.93, "unrelated"), ("c2", 0.91, "contradicts")], t) == ("conflict", "c2")
    # a contradiction outranks a duplicate
    assert decide_claim([("c1", 0.97, "same"), ("c2", 0.9, "contradicts")], t) == ("conflict", "c2")


def test_budget_blocks_after_the_hourly_cap_but_never_the_first_job():
    budget = PassageBudget(per_hour=10)
    assert budget.take(25)  # first job always runs
    assert not budget.take(1)
    fresh = PassageBudget(per_hour=10)
    assert fresh.take(8) and not fresh.take(5) and fresh.take(2)


# ---------------------------------------------------------------- through the API
def test_same_fact_from_two_sources_becomes_one_claim_with_two_sources(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)

    body = knowledge(client, notebook["id"])
    index = concept_named(body, "Index")
    assert index["source_count"] == 2
    assert {c["name"] for c in body["concepts"]} >= {"Index", "B-tree", "Transaction"}
    assert body["job"]["status"] == "done"

    detail = client.get(f"/notebooks/{notebook['id']}/concepts/{index['id']}").json()
    reads = next(c for c in detail["claims"] if c["text"].startswith("An index speeds up reads"))
    assert {e["source_name"] for e in reads["evidence"]} == {"lecture.md", "textbook.md"}
    assert detail["conflicts"] == []


def test_contradiction_is_recorded_not_merged_and_disappears_with_its_source(client, services):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    blog = upload(client, notebook["id"], name="blog.md", data=BLOG)["source"]

    body = knowledge(client, notebook["id"])
    index = concept_named(body, "Index")
    assert index["status"] == "conflicted"
    assert body["conflict_count"] == 1 and index["id"] in body["concepts_with_conflicts"]

    detail = client.get(f"/notebooks/{notebook['id']}/concepts/{index['id']}").json()
    conflict = detail["conflicts"][0]
    assert conflict["claim_text"].startswith("An index speeds up reads")  # the book keeps the existing claim
    assert "never" in conflict["contradicting_text"]
    assert conflict["contradicting_evidence"]["source_name"] == "blog.md"
    assert all("never" not in c["text"] for c in detail["claims"])  # it did not become a claim

    assert client.delete(f"/sources/{blog['id']}").status_code == 204
    after = knowledge(client, notebook["id"])
    assert after["conflict_count"] == 0
    assert concept_named(after, "Index")["status"] == "current"


def test_removing_the_only_source_of_a_concept_removes_the_concept(client):
    notebook = make_notebook(client)
    lecture = upload(client, notebook["id"], name="lecture.md", data=LECTURE)["source"]
    upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)
    assert "B-tree" in {c["name"] for c in knowledge(client, notebook["id"])["concepts"]}

    client.delete(f"/sources/{lecture['id']}")
    body = knowledge(client, notebook["id"])
    names = {c["name"] for c in body["concepts"]}
    assert "B-tree" not in names  # only the lecture mentioned it
    assert concept_named(body, "Index")["source_count"] == 1


def test_rebuild_is_idempotent(client):
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    before = knowledge(client, notebook["id"])
    assert client.post(f"/notebooks/{notebook['id']}/knowledge/rebuild").status_code == 202
    after = knowledge(client, notebook["id"])
    assert [(c["name"], c["claim_count"], c["evidence_count"]) for c in after["concepts"]] == [
        (c["name"], c["claim_count"], c["evidence_count"]) for c in before["concepts"]
    ]


def test_other_users_knowledge_is_404(client, services):
    stranger = services.repo.create_notebook("someone-else", "Private", None)
    assert client.get(f"/notebooks/{stranger['id']}/knowledge").status_code == 404
    mine = make_notebook(client)
    assert client.get(f"/notebooks/{mine['id']}/concepts/not-a-concept").status_code == 404


def test_a_broken_knowledge_build_never_fails_the_upload(client, services, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("relation public.knowledge_jobs does not exist")

    monkeypatch.setattr(services.repo, "insert", boom)
    notebook = make_notebook(client)
    source = upload(client, notebook["id"], name="lecture.md", data=LECTURE)["source"]
    assert client.get(f"/sources/{source['id']}").json()["status"] == "ready"


def test_near_concepts_are_merged_only_when_the_llm_says_same(client, services):
    services.settings.concept_merge_similarity = 0.0  # every new concept is a near-match
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    names = {c["name"] for c in knowledge(client, notebook["id"])["concepts"]}
    assert {"Index", "B-tree"} <= names  # judged "unrelated", so not merged into one


def test_a_concept_without_claims_keeps_its_definition_as_evidence(client, services):
    services.llm.json_outputs[Extraction] = [
        '{"concepts": [{"name": "Paging", "kind": "term", "definition": "Memory split into fixed-size pages.",'
        ' "aliases": [], "passage": 0}], "claims": [], "links": []}'
    ] * 2
    notebook = make_notebook(client)
    upload(client, notebook["id"], name="lecture.md", data=LECTURE)
    paging = concept_named(knowledge(client, notebook["id"]), "Paging")
    assert paging["evidence_count"] == 1 and paging["source_count"] == 1
    client.post(f"/notebooks/{notebook['id']}/knowledge/rebuild")
    assert concept_named(knowledge(client, notebook["id"]), "Paging")["evidence_count"] == 1


def test_sources_that_finish_together_do_not_lose_each_others_concepts(client, services):
    import threading

    from app.knowledge.build import build_for_source

    notebook = make_notebook(client)
    lecture = upload(client, notebook["id"], name="lecture.md", data=LECTURE)["source"]
    textbook = upload(client, notebook["id"], name="textbook.md", data=TEXTBOOK)["source"]
    threads = [threading.Thread(target=build_for_source, args=(services, s["id"])) for s in (lecture, textbook) * 3]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    body = knowledge(client, notebook["id"])
    assert {c["name"] for c in body["concepts"]} >= {"Index", "B-tree", "Transaction"}
    assert all(c["evidence_count"] > 0 for c in body["concepts"])
    assert len({c["name"].lower() for c in body["concepts"]}) == len(body["concepts"])  # no duplicates
