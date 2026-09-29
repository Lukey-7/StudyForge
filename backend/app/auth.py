"""Who is calling? Ask Supabase.

Login happens in the browser with supabase-js; Supabase gives the browser an
access token (a signed JWT). The frontend sends it as `Authorization: Bearer <token>`.
The backend never sees passwords; it asks Supabase Auth "whose token is this?"
with `supabase.auth.get_user(token)`. Supabase checks the signature, expiry and
whether the session was revoked, so we don't re-implement JWT verification
(algorithms, key rotation, audiences) ourselves.

To avoid one network call per request, a verified token is remembered for 60
seconds (keyed by its SHA-256 hash, so raw tokens are never stored).
"""

import hashlib
import logging
import threading
import time
from dataclasses import dataclass

from fastapi import HTTPException, status

from app.config import Settings

logger = logging.getLogger(__name__)

DEV_USER_ID = "00000000-0000-4000-8000-000000000001"
CACHE_TTL_S = 60


@dataclass(frozen=True)
class User:
    id: str
    email: str | None


class Authenticator:
    def __init__(self, settings: Settings, supabase_client=None) -> None:
        self.settings = settings
        self._client = supabase_client
        self._cache: dict[str, tuple[User, float]] = {}
        self._lock = threading.Lock()

    def _supabase(self):
        if self._client is None:
            from supabase import create_client

            if not self.settings.supabase_url or not self.settings.supabase_service_role_key:
                raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Supabase auth is not configured")
            self._client = create_client(self.settings.supabase_url, self.settings.supabase_service_role_key)
        return self._client

    def verify(self, authorization: str | None) -> User:
        if self.settings.auth_mode == "dev":
            return User(DEV_USER_ID, "dev@studyforge.local")

        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
        token = authorization.split(" ", 1)[1].strip()
        key = hashlib.sha256(token.encode()).hexdigest()

        with self._lock:
            cached = self._cache.get(key)
        if cached and cached[1] > time.monotonic():
            return cached[0]

        try:
            response = self._supabase().auth.get_user(token)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 - invalid, expired or revoked token
            logger.info("rejected token: %s", exc)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token") from exc
        if response is None or response.user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")

        user = User(id=response.user.id, email=response.user.email)
        with self._lock:
            if len(self._cache) > 10_000:  # keep memory bounded
                self._cache.clear()
            self._cache[key] = (user, time.monotonic() + CACHE_TTL_S)
        return user
