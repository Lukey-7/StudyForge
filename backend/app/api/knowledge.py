"""The knowledge map (the Book tab, phase 1): concepts, their claims and evidence, conflicts."""

from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.api.deps import get_services, owned_notebook
from app.book.sync import after_knowledge_change
from app.db.repository import Row
from app.knowledge.build import build_for_source
from app.services import Services

router = APIRouter(tags=["knowledge"])


def _load(services: Services, notebook_id: str) -> dict:
    """Everything for one notebook in a handful of queries, joined in Python."""
    repo = services.repo
    sources = {s["id"]: s for s in repo.list_sources(notebook_id)}
    return {
        "sources": sources,
        "concepts": repo.select("concepts", notebook_id=notebook_id),
        "claims": repo.select("claims", notebook_id=notebook_id),
        "evidence": repo.select("claim_evidence", notebook_id=notebook_id),
        "conflicts": repo.select("conflicts", notebook_id=notebook_id),
        "links": repo.select("concept_links", notebook_id=notebook_id),
        "jobs": [j for j in repo.select("knowledge_jobs", notebook_id=notebook_id) if j.get("kind", "extract") == "extract"],
    }


def _evidence_view(evidence: Row, sources: dict[str, Row]) -> dict:
    source = sources.get(evidence["source_id"], {})
    return {
        "chunk_id": evidence["chunk_id"],
        "source_id": evidence["source_id"],
        "source_name": source.get("file_name", "source"),
        "page": evidence.get("page"),
    }


def _job_summary(jobs: list[Row]) -> dict | None:
    """Overall progress of the latest build of each source."""
    latest: dict[str, Row] = {}
    for job in jobs:  # oldest first, so later rows win
        latest[job.get("source_id") or job["id"]] = job
    if not latest:
        return None
    rows = list(latest.values())
    running = [j for j in rows if j["status"] == "running"]
    return {
        "status": "running" if running else ("queued" if any(j["status"] == "queued" for j in rows) else "done"),
        "progress": round(sum(j["progress"] for j in rows) / len(rows)),
        "failed": [j.get("detail") for j in rows if j["status"] == "failed"],
        "queued": [j.get("detail") for j in rows if j["status"] == "queued"],
    }


@router.get("/notebooks/{notebook_id}/knowledge")
def knowledge_map(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    data = _load(services, notebook["id"])
    claims_by_concept: dict[str, list[str]] = defaultdict(list)
    for claim in data["claims"]:
        claims_by_concept[claim["concept_id"]].append(claim["id"])
    evidence_by_claim: dict[str, list[Row]] = defaultdict(list)
    for evidence in data["evidence"]:
        evidence_by_claim[evidence["claim_id"]].append(evidence)
    concept_of_claim = {c["id"]: c["concept_id"] for c in data["claims"]}
    names = {c["id"]: c["name"] for c in data["concepts"]}

    concepts = []
    for concept in data["concepts"]:
        pieces = [e for claim_id in claims_by_concept[concept["id"]] for e in evidence_by_claim[claim_id]]
        concepts.append(
            {
                "id": concept["id"],
                "name": concept["name"],
                "kind": concept["kind"],
                "definition": concept["definition"],
                "aliases": concept.get("aliases") or [],
                "status": concept["status"],
                "claim_count": len(claims_by_concept[concept["id"]]),
                "evidence_count": len(pieces),
                "source_count": len({e["source_id"] for e in pieces}),
            }
        )
    concepts.sort(key=lambda c: c["name"].lower())

    return {
        "concepts": concepts,
        "links": [
            {"from_id": link["from_id"], "to_id": link["to_id"], "kind": link["kind"]}
            for link in data["links"]
            if link["from_id"] in names and link["to_id"] in names
        ],
        "conflict_count": len(data["conflicts"]),
        "concepts_with_conflicts": sorted({concept_of_claim.get(c["claim_id"]) for c in data["conflicts"]} - {None}),
        "job": _job_summary(data["jobs"]),
    }


@router.get("/notebooks/{notebook_id}/concepts/{concept_id}")
def concept_detail(concept_id: str, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> dict:
    data = _load(services, notebook["id"])
    concept = next((c for c in data["concepts"] if c["id"] == concept_id), None)
    if concept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "concept not found")
    names = {c["id"]: c["name"] for c in data["concepts"]}
    claims = [c for c in data["claims"] if c["concept_id"] == concept_id]
    claim_ids = {c["id"] for c in claims}
    evidence_by_claim: dict[str, list[dict]] = defaultdict(list)
    for evidence in data["evidence"]:
        if evidence["claim_id"] in claim_ids:
            evidence_by_claim[evidence["claim_id"]].append(_evidence_view(evidence, data["sources"]))
    claim_text = {c["id"]: c["text"] for c in claims}

    related = []
    for link in data["links"]:
        if link["from_id"] == concept_id and link["to_id"] in names:
            related.append({"id": link["to_id"], "name": names[link["to_id"]], "kind": link["kind"], "direction": "out"})
        elif link["to_id"] == concept_id and link["from_id"] in names:
            related.append({"id": link["from_id"], "name": names[link["from_id"]], "kind": link["kind"], "direction": "in"})

    return {
        "concept": {**concept, "aliases": concept.get("aliases") or []},
        "claims": [
            {"id": c["id"], "text": c["text"], "evidence": evidence_by_claim[c["id"]]}
            for c in sorted(claims, key=lambda c: -len(evidence_by_claim[c["id"]]))
        ],
        "conflicts": [
            {
                "id": conflict["id"],
                "claim_text": claim_text[conflict["claim_id"]],
                "claim_evidence": evidence_by_claim[conflict["claim_id"]],
                "contradicting_text": conflict["contradicting_text"],
                "contradicting_evidence": _evidence_view(conflict, data["sources"]),
            }
            for conflict in data["conflicts"]
            if conflict["claim_id"] in claim_ids
        ],
        "related": related,
    }


def _rebuild(services: Services, notebook_id: str) -> None:
    for source in services.repo.list_sources(notebook_id):
        if source["status"] == "ready":
            build_for_source(services, source["id"])
    after_knowledge_change(services, notebook_id)


@router.post("/notebooks/{notebook_id}/knowledge/rebuild", status_code=status.HTTP_202_ACCEPTED)
def rebuild(
    background: BackgroundTasks, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)
) -> dict:
    """Re-reads every ready source (idempotent: each source's old contribution is removed first)."""
    if services.embedder is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI is not configured (GEMINI_API_KEY missing)")
    background.add_task(_rebuild, services, notebook["id"])
    return {"status": "started"}
