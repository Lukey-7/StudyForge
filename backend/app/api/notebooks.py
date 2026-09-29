"""Notebook CRUD."""

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.api.deps import get_services, get_user, owned_notebook
from app.auth import User
from app.db.repository import Row
from app.services import Services

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


class NotebookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class NotebookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


@router.get("")
def list_notebooks(user: User = Depends(get_user), services: Services = Depends(get_services)) -> list[Row]:
    notebooks = services.repo.list_notebooks(user.id)
    for notebook in notebooks:
        sources = services.repo.list_sources(notebook["id"])
        notebook["source_count"] = len(sources)
        notebook["ready_count"] = sum(1 for s in sources if s["status"] == "ready")
    return notebooks


@router.post("", status_code=status.HTTP_201_CREATED)
def create_notebook(body: NotebookCreate, user: User = Depends(get_user), services: Services = Depends(get_services)) -> Row:
    return services.repo.create_notebook(user.id, body.title.strip(), body.description)


@router.get("/{notebook_id}")
def get_notebook(notebook: Row = Depends(owned_notebook)) -> Row:
    return notebook


@router.patch("/{notebook_id}")
def update_notebook(
    body: NotebookUpdate, notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)
) -> Row:
    fields = body.model_dump(exclude_none=True)
    return services.repo.update_notebook(notebook["id"], fields) if fields else notebook


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> None:
    sources = services.repo.list_sources(notebook["id"])
    services.vectors.delete_notebook(notebook["id"])
    services.storage.delete([s["storage_path"] for s in sources])
    services.repo.delete_notebook(notebook["id"])  # cascades to every child table
    services.bm25.invalidate(notebook["id"])
