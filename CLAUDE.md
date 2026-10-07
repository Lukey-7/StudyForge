# StudyForge: handoff for Claude

StudyForge turns a pile of course material (notes, PDFs, Word, slide photos, recordings) into one living textbook per
notebook, with a knowledge map, a source-grounded chat and 16 study tools. Read `README.md`, then `docs/SETUP.md`,
`docs/ARCHITECTURE.md` and `docs/HOW_IT_WORKS.md`.

**State (7 Oct 2026):** active branch **`v2`** (one commit ahead of `main`: the Supabase keep-alive workflow).
github.com/Lukey-7/StudyForge. CI green on push (backend lint + tests, frontend build, Docker image starts).

## Projects, in the order the owner works on them

1. FinTrack — `C:\Users\hp\Personal_Finance_app` (Android, Kotlin), github.com/Lukey-7/Personal_Finance_app
2. iOS app (KiranOS) — `C:\Users\hp\IOS_APP`, branch `feat/ios-app`
3. **StudyForge** (this repo) — `C:\Users\hp\Kiran_Doc_verif\StudyForge`
4. Lead-gen (Creaitify) — `C:\Users\hp\HELM_FINAL\Lead-gen-automation`, github.com/Creaitify/Lead-gen-automation

## How the owner wants to work

- Plan first for anything non-trivial (a markdown checklist), then build; they may say "just do it".
- No AI attribution in commits, PRs or release notes (no `Co-Authored-By: Claude`, no "Generated with Claude Code").
- Plain, direct writing in the UI and docs. Report test results honestly.

## Stack

- **Backend:** FastAPI (Python 3.12), embedded ChromaDB (a folder on disk), Gemini (LLM + `gemini-embedding-001`),
  optional OpenAI fallback. `backend/app/`: `api/` routers, `ingest/` (extract → chunk → embed), `retrieval/`
  (dense + BM25 → RRF → MMR), `generation/` (16 study-tool pipelines), `chat/rag_chat.py` (SSE), `knowledge/build.py`
  (knowledge map), `book/sync.py` (the living textbook). Migrations in `backend/migrations/001`–`007`.
- **Frontend:** React 19 + Vite + React Query, Supabase JS for auth. `frontend/src/`, design notes in `frontend/DESIGN.md`.
- **Supabase:** Postgres (source of truth, RLS), Auth, Storage (bucket `sources`). Chroma is only an index and can be
  rebuilt from Postgres (`python -m scripts.reindex`, or `REINDEX_ON_START=true`).

## Run it locally (Windows)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env        # fill in the values below
uvicorn app.main:create_app --factory --reload --port 8080   # http://localhost:8080/health, /docs

cd frontend
npm install && npm run dev    # http://localhost:5173
```

- **Demo mode:** `DB_BACKEND=memory`, `AUTH_MODE=dev`, only `GEMINI_API_KEY` needed; data in `backend/data/`.
- **Full mode:** `DB_BACKEND=supabase`, `AUTH_MODE=supabase` plus the Supabase values.
- Backend env vars (`backend/.env`, never committed): `DB_BACKEND`, `AUTH_MODE`, `GEMINI_API_KEY`, `LLM_MODEL`,
  `EMBEDDING_MODEL`, `EMBEDDING_FALLBACK_MODEL`, `EMBEDDING_DIM`, `GEMINI_RPM`, `EMBED_RPM`, `OPENAI_API_KEY`,
  `OPENAI_MODEL`, `LLM_FALLBACK_TO_OPENAI`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET`,
  `RERANK_WITH_LLM`, `CHROMA_MODE`, `REINDEX_ON_START`, `CORS_ORIGINS`, `LOG_LEVEL`.
- Frontend env vars (`frontend/.env`): `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- The service-role key is server-only; never put it in the frontend.

## Test

```bash
cd backend && ruff check app tests eval scripts && pytest     # ~155 tests
cd frontend && npm test && npm run build                       # vitest, ~30 tests
```

`backend/eval/` holds retrieval and book-quality evaluations.

## Deploy

See `docs/DEPLOY.md` (and `docs/DEPLOY_GCP.md`). Backend: one Docker image (`backend/Dockerfile`); a Render blueprint
is in `render.yaml` (free plan, `REINDEX_ON_START=true`, `CORS_ORIGINS=https://lukey-7.github.io`). Frontend: GitHub
Pages via `.github/workflows/pages.yml`. `.github/workflows/supabase-keepalive.yml` queries Supabase every 3 days so
the free project is not paused. CI (`ci.yml`) proves the image builds and answers `/health`.

## Where to look next

`docs/LIVING_TEXTBOOK_PLAN.md` (the book roadmap), `docs/DECISIONS.md` (why things are the way they are),
`docs/V1_AUDIT.md`, `docs/API.md`, `docs/STUDY_GUIDE.md`. `legacy-go/` is the old Go version, kept for reference only.
