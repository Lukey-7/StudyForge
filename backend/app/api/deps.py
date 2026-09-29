"""FastAPI dependencies shared by all routers."""

from fastapi import Depends, Header, HTTPException, Request, status

from app.auth import User
from app.db.repository import Row
from app.services import Services


def get_services(request: Request) -> Services:
    return request.app.state.services


def get_user(
    request: Request,
    authorization: str | None = Header(default=None),
    services: Services = Depends(get_services),
) -> User:
    user = request.app.state.authenticator.verify(authorization)
    seen: set[str] = request.app.state.known_users
    if user.id not in seen:  # make sure the profiles row exists (FK target), once per process
        services.repo.ensure_profile(user.id, user.email)
        seen.add(user.id)
    return user


def owned_notebook(notebook_id: str, user: User = Depends(get_user), services: Services = Depends(get_services)) -> Row:
    """404 (not 403) for other people's notebooks, so ids can't be probed."""
    notebook = services.repo.get_notebook(user.id, notebook_id)
    if notebook is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "notebook not found")
    return notebook


def owned_source(source_id: str, user: User = Depends(get_user), services: Services = Depends(get_services)) -> Row:
    source = services.repo.get_source(source_id)
    if source is None or services.repo.get_notebook(user.id, source["notebook_id"]) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found")
    return source
