# Deploying StudyForge

StudyForge is two deployable parts plus Supabase:

| Part | What it is | Where it can run |
|---|---|---|
| **Backend** | FastAPI + embedded Chroma, one Docker image (`backend/Dockerfile`) | Render, Google Cloud Run, a Hugging Face Space (PRO), any Docker host |
| **Frontend** | static files from `npm run build` | GitHub Pages (workflow included), or any static host |
| **Supabase** | Postgres + Auth + Storage | already hosted; run `backend/migrations/001`–`007` once in the SQL editor |

**Proof that it deploys:** on every push, CI builds the production image, starts it in demo mode, and checks that `GET /health` answers (the `docker` job in `.github/workflows/ci.yml`).

---

## 1. Backend

### Settings (environment variables)

| Variable | Value |
|---|---|
| `DB_BACKEND` / `AUTH_MODE` | `supabase` / `supabase` |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret**: service-role key (server only, never in the frontend) |
| `GEMINI_API_KEY` | **secret** |
| `OPENAI_API_KEY` | **secret**, optional fallback |
| `CORS_ORIGINS` | the frontend origin, e.g. `https://lukey-7.github.io` |
| `REINDEX_ON_START` | `true` on hosts without a persistent disk |
| `PORT` | set by the host; the image listens on it (default 8080) |

**Why `REINDEX_ON_START`:** Chroma is only an index; Postgres is the source of truth. On a host whose disk is wiped on restart (Render free, Cloud Run, Spaces), the API finds an empty index at startup and rebuilds it in the background from Supabase: passages, concepts, claims and book sections (`app/reindex.py`). This costs one embedding call per 50 items. You can also run it by hand: `python -m scripts.reindex`.

### Option A: Render (free, no card)

1. Sign up at render.com with GitHub.
2. Go to **New → Blueprint** and pick `Lukey-7/StudyForge`. It reads `render.yaml` (Docker, free plan, health check on `/health`).
3. Paste the four secret values it asks for, from `backend/.env`.
4. The API is at `https://studyforge-api.onrender.com` (or whatever name Render shows).

Limits: 512 MB RAM. It sleeps after 15 minutes idle, so the first request after that takes about a minute, and the index is rebuilt on each wake.

### Option B: Google Cloud Run

See [DEPLOY_GCP.md](DEPLOY_GCP.md): Cloud Build (no local Docker), Secret Manager, the three Chroma options, `--no-cpu-throttling` so background ingestion keeps running. Needs a project with billing.

### Option C: Hugging Face Space (needs PRO)

```bash
cd backend
hf auth login                              # a token with write access
python -m scripts.deploy_space             # creates <user>/studyforge-api, uploads backend code only
python -m scripts.deploy_space --secrets   # copies the keys from backend/.env into Space secrets
```

Hugging Face now hosts Docker Spaces only for PRO accounts: a free account gets `402 Payment Required` (checked 2026-09-30).

### Any Docker host

```bash
docker build -t studyforge-api backend
docker run -p 8080:8080 --env-file backend/.env -e REINDEX_ON_START=true studyforge-api
```

---

## 2. Frontend on GitHub Pages

The workflow `.github/workflows/pages.yml` builds `frontend/` with the base path `/StudyForge/`. It adds a `404.html` copy of the app so deep links like `/StudyForge/notebooks/<id>` work, and publishes to **https://lukey-7.github.io/StudyForge/**.

Already done in the repo:
- Pages is set to "GitHub Actions";
- the variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. The anon key is public by design and protected by row-level security.

To publish:
1. Deploy the backend (section 1) and copy its URL.
2. Set the variable, then publish, either by pushing to `main` or with the second command:

```bash
gh variable set VITE_API_URL --repo Lukey-7/StudyForge --body https://YOUR-BACKEND-URL
```

```bash
gh workflow run pages.yml --repo Lukey-7/StudyForge
```

Until `VITE_API_URL` is set, the workflow skips publishing on purpose: the site would otherwise call `http://localhost:8080`.

3. Make sure the backend's `CORS_ORIGINS` includes `https://lukey-7.github.io`.

Login is email and password, so Supabase needs no redirect URLs. If you turn on email confirmation, add `https://lukey-7.github.io/StudyForge/` under Supabase → Authentication → URL configuration.

---

## 3. After deploying: a two-minute check

1. `GET https://YOUR-BACKEND-URL/health` returns `"status": "ok"`, `"db_backend": "supabase"`, `"ai_configured": true`.
2. The backend logs show `vector index is empty: rebuilding it from Postgres`, then `vector index rebuilt`.
3. Open the site, log in, open a notebook: the Book tab shows the book, chat answers with `[S#]` and `[B#]` citations, and search on the home page finds concepts.
