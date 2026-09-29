from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.auth import DEV_USER_ID, Authenticator
from app.config import Settings


class FakeSupabaseAuth:
    def __init__(self) -> None:
        self.calls = 0

    def get_user(self, token: str):
        self.calls += 1
        if token == "good":
            return SimpleNamespace(user=SimpleNamespace(id="user-1", email="a@b.c"))
        raise RuntimeError("invalid JWT")


def make(fake: FakeSupabaseAuth) -> Authenticator:
    settings = Settings(_env_file=None, auth_mode="supabase")
    return Authenticator(settings, supabase_client=SimpleNamespace(auth=fake))


def test_valid_token_is_verified_by_supabase_and_cached():
    fake = FakeSupabaseAuth()
    auth = make(fake)
    assert auth.verify("Bearer good").id == "user-1"
    assert auth.verify("Bearer good").email == "a@b.c"
    assert fake.calls == 1  # second call served from the 60 s cache


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer bad"])
def test_bad_tokens_are_401(header):
    with pytest.raises(HTTPException) as info:
        make(FakeSupabaseAuth()).verify(header)
    assert info.value.status_code == 401


def test_dev_mode_returns_fixed_user():
    user = Authenticator(Settings(_env_file=None, auth_mode="dev")).verify(None)
    assert user.id == DEV_USER_ID
