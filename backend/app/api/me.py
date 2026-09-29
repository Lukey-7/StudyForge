"""The signed-in home page's data in one request: what you have, what you made, what you asked."""

from fastapi import APIRouter, Depends

from app.api.deps import get_services, get_user
from app.auth import User
from app.services import Services

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/overview")
def overview(user: User = Depends(get_user), services: Services = Depends(get_services)) -> dict:
    """Notebooks (most recently updated first) with document counts, totals, the latest
    generations and chats across all notebooks, each labelled with its notebook's title."""
    repo = services.repo
    notebooks = repo.list_notebooks(user.id)
    for notebook in notebooks:
        sources = repo.list_sources(notebook["id"])
        notebook["source_count"] = len(sources)
        notebook["ready_count"] = sum(1 for s in sources if s["status"] == "ready")
    notebooks.sort(key=lambda n: n.get("updated_at") or n["created_at"], reverse=True)
    titles = {n["id"]: n["title"] for n in notebooks}

    generations = [
        {**g, "notebook_title": titles[g["notebook_id"]]}
        for g in repo.list_recent_generations(user.id, limit=8)
        if g["notebook_id"] in titles
    ]
    chats = [
        {**c, "notebook_title": titles[c["notebook_id"]]}
        for c in repo.list_recent_chat_sessions(user.id, limit=6)
        if c["notebook_id"] in titles
    ]
    return {
        "notebooks": notebooks,
        "totals": {
            "notebooks": len(notebooks),
            "sources": sum(n["source_count"] for n in notebooks),
            "ready_sources": sum(n["ready_count"] for n in notebooks),
            "generations": repo.count_generations(user.id),
        },
        "recent_generations": generations,
        "recent_chats": chats,
    }
