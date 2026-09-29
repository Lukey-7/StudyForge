"""Upload sources, poll ingestion status, retry, delete."""

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.deps import get_services, get_user, owned_notebook, owned_source
from app.auth import User
from app.db.repository import Row
from app.ingest.extract import UnsupportedFileType
from app.ingest.pipeline import UploadTooLarge, create_source, delete_source, run_ingestion
from app.services import Services

router = APIRouter(tags=["sources"])


class PastedText(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=20, max_length=2_000_000)


def _accept(
    services: Services, user: User, notebook: Row, name: str, data: bytes, mime: str | None, background: BackgroundTasks
) -> JSONResponse:
    if services.embedder is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI is not configured (GEMINI_API_KEY missing)")
    try:
        row, duplicate = create_source(services, user.id, notebook["id"], name, data, mime)
    except UploadTooLarge as exc:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc)) from exc
    except (UnsupportedFileType, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    if not duplicate or row["status"] == "failed":
        background.add_task(run_ingestion, services, row["id"])  # runs after the response is sent
    # 202 Accepted = "got it, processing in the background"; 200 = already had this exact file.
    return JSONResponse(
        {"source": row, "duplicate": duplicate},
        status_code=status.HTTP_200_OK if duplicate else status.HTTP_202_ACCEPTED,
    )


@router.post("/notebooks/{notebook_id}/sources")
async def upload_source(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    notebook: Row = Depends(owned_notebook),
    user: User = Depends(get_user),
    services: Services = Depends(get_services),
) -> JSONResponse:
    data = await file.read()
    return _accept(services, user, notebook, file.filename or "upload", data, file.content_type, background)


@router.post("/notebooks/{notebook_id}/sources/text")
def add_text_source(
    body: PastedText,
    background: BackgroundTasks,
    notebook: Row = Depends(owned_notebook),
    user: User = Depends(get_user),
    services: Services = Depends(get_services),
) -> JSONResponse:
    name = body.title if body.title.lower().endswith((".txt", ".md")) else f"{body.title}.md"
    return _accept(services, user, notebook, name, body.text.encode("utf-8"), "text/markdown", background)


@router.get("/notebooks/{notebook_id}/sources")
def list_sources(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> list[Row]:
    return services.repo.list_sources(notebook["id"])


@router.get("/sources/{source_id}")
def get_source(source: Row = Depends(owned_source)) -> Row:
    """Polled by the UI every ~2s until status is 'ready' or 'failed'."""
    return source


@router.get("/sources/{source_id}/chunks")
def get_source_chunks(source: Row = Depends(owned_source), services: Services = Depends(get_services)) -> list[Row]:
    return services.repo.list_chunks(source["notebook_id"], [source["id"]])


@router.post("/sources/{source_id}/retry", status_code=status.HTTP_202_ACCEPTED)
def retry_source(
    background: BackgroundTasks, source: Row = Depends(owned_source), services: Services = Depends(get_services)
) -> Row:
    if source["status"] not in ("failed", "ready"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"source is busy ({source['status']})")
    row = services.repo.update_source(source["id"], {"status": "uploaded", "error_message": None})
    background.add_task(run_ingestion, services, source["id"])
    return row


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_source(source: Row = Depends(owned_source), services: Services = Depends(get_services)) -> None:
    delete_source(services, source)
