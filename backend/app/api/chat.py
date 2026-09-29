"""Chat endpoints: streaming answer (SSE) + session history."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import get_services, get_user, owned_notebook
from app.auth import User
from app.chat.rag_chat import chat_stream
from app.db.repository import Row
from app.services import Services

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None
    source_ids: list[str] | None = None


def _owned_session(session_id: str, user: User, services: Services) -> Row:
    session = services.repo.get_chat_session(session_id)
    if session is None or session["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "chat session not found")
    return session


@router.post("/notebooks/{notebook_id}/chat")
def chat(
    body: ChatRequest,
    notebook: Row = Depends(owned_notebook),
    user: User = Depends(get_user),
    services: Services = Depends(get_services),
) -> StreamingResponse:
    if body.session_id:
        _owned_session(body.session_id, user, services)
    stream = chat_stream(services, notebook, user.id, body.message, body.session_id, body.source_ids)
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},  # don't let proxies buffer tokens
    )


@router.get("/notebooks/{notebook_id}/chat/sessions")
def list_sessions(notebook: Row = Depends(owned_notebook), services: Services = Depends(get_services)) -> list[Row]:
    return services.repo.list_chat_sessions(notebook["id"])


@router.get("/chat/sessions/{session_id}/messages")
def list_messages(session_id: str, user: User = Depends(get_user), services: Services = Depends(get_services)) -> list[Row]:
    _owned_session(session_id, user, services)
    return services.repo.list_chat_messages(session_id)


@router.delete("/chat/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, user: User = Depends(get_user), services: Services = Depends(get_services)) -> None:
    _owned_session(session_id, user, services)
    services.repo.delete_chat_session(session_id)
