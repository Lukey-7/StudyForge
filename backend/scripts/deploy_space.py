"""Deploy the backend to a Hugging Face Space (Docker SDK).

    cd backend
    python -m scripts.deploy_space            # create/update the Space: code + public settings
    python -m scripts.deploy_space --secrets  # copy the API keys from backend/.env into the Space's secrets

Needs `hf auth login` (a token with write access) first, and a PRO account: Hugging Face only
hosts Docker Spaces for PRO subscribers (a free account gets 402 Payment Required).
Only backend code is uploaded (never .env, .venv, data or tests). Chroma starts empty in the
container and is rebuilt from Supabase (REINDEX_ON_START). The Space is public so the browser can
call it; every route still checks the Supabase login.
"""

import argparse
import shutil
import tempfile
from pathlib import Path

from dotenv import dotenv_values
from huggingface_hub import HfApi

BACKEND = Path(__file__).resolve().parents[1]
SPACE_NAME = "studyforge-api"
FRONTEND_ORIGIN = "https://lukey-7.github.io"
SECRETS = ("GEMINI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY")

README = """---
title: StudyForge API
emoji: 📚
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 8080
pinned: false
short_description: Backend of StudyForge (FastAPI, Gemini, Chroma, Supabase)
---

The FastAPI backend of [StudyForge](https://github.com/Lukey-7/StudyForge).
The app itself is at https://lukey-7.github.io/StudyForge/.
"""


def space_url(repo_id: str) -> str:
    owner, name = repo_id.split("/")
    return f"https://{owner.lower()}-{name.lower()}.hf.space".replace("_", "-")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--secrets", action="store_true", help="copy API keys from backend/.env into the Space secrets")
    args = parser.parse_args()

    api = HfApi()
    user = api.whoami()["name"]
    repo_id = f"{user}/{SPACE_NAME}"
    env = dotenv_values(BACKEND / ".env")

    if args.secrets:
        for key in SECRETS:
            if env.get(key):
                api.add_space_secret(repo_id, key, env[key])
                print(f"secret {key} set")  # the name only, never the value
        return

    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        for name in ("app", "migrations", "scripts"):
            shutil.copytree(BACKEND / name, stage / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        for name in ("Dockerfile", "requirements.txt"):
            shutil.copy(BACKEND / name, stage / name)
        (stage / "README.md").write_text(README, encoding="utf-8")
        api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=stage, commit_message="Deploy StudyForge API")

    settings = {
        "DB_BACKEND": "supabase",
        "AUTH_MODE": "supabase",
        "SUPABASE_URL": env.get("SUPABASE_URL", ""),
        "CORS_ORIGINS": FRONTEND_ORIGIN,
        "REINDEX_ON_START": "true",
    }
    for key, value in settings.items():
        api.add_space_variable(repo_id, key, value)
    print(f"Space: https://huggingface.co/spaces/{repo_id}")
    print(f"API:   {space_url(repo_id)}")


if __name__ == "__main__":
    main()
