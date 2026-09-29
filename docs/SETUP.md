# Setup & how to run

StudyForge runs in two modes:

| Mode | Needs | Use for |
|---|---|---|
| **Demo** (`DB_BACKEND=memory`, `AUTH_MODE=dev`) | Gemini API key only | Trying it out and demos. No login; data lives in `backend/data/` |
| **Full** (`DB_BACKEND=supabase`, `AUTH_MODE=supabase`) | Gemini key + a Supabase project | Real use: accounts, Postgres, file storage |

Chroma runs **embedded** in both modes (a folder on disk). No Docker is needed.

## 1. Prerequisites

- Python **3.12+** (`python --version`)
- Node.js **20+** (`node --version`)
- A **Gemini API key**: https://aistudio.google.com/app/apikey (free tier works)
- Optional: an **OpenAI API key**, used only as a fallback when Gemini is rate-limited
- For full mode: a free **Supabase** project: https://supabase.com

## 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows PowerShell
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements-dev.txt
copy .env.example .env            # Windows (cp on macOS/Linux)
```

Edit `backend/.env`:

```ini
GEMINI_API_KEY=your-key
# optional fallback:
OPENAI_API_KEY=
```

Start it:

```bash
uvicorn app.main:create_app --factory --reload --port 8080
```

Check http://localhost:8080/health. `ai_configured` should be `true`, and `embedding_model` shows the embedding model in use. API docs are at http://localhost:8080/docs.

## 3. Frontend

```bash
cd frontend
npm install
copy .env.example .env            # optional in demo mode
npm run dev
```

Open http://localhost:5173. In demo mode there's no login and a "Demo mode" badge appears in the sidebar.

## 4. Full mode with Supabase

1. Create a project at supabase.com and wait until it's ready.
2. **Run the schema:** in the dashboard, open **SQL Editor** → **New query**, paste all of `backend/migrations/001_init.sql` and click **Run**. This creates the tables, indexes, RLS policies, the sign-up trigger and the `sources` storage bucket.
3. **Get the keys** (Project Settings → API / API Keys):
   - Project URL → `SUPABASE_URL` (backend) and `VITE_SUPABASE_URL` (frontend)
   - `anon` / publishable key → `VITE_SUPABASE_ANON_KEY` (frontend only; safe in the browser)
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (**backend only, never in the frontend or git**)
4. **Auth settings** (Authentication → Sign In / Providers → Email): keep Email enabled. For quick local testing you can turn off **Confirm email**; otherwise new users must click the link in their inbox. Under Authentication → URL Configuration, add `http://localhost:5173` as the Site URL / redirect URL.
5. `backend/.env`:
   ```ini
   DB_BACKEND=supabase
   AUTH_MODE=supabase
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
6. `frontend/.env`:
   ```ini
   VITE_API_URL=http://localhost:8080
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```
7. Restart both servers, sign up in the app and create a notebook.

## 5. Using it

1. **Create a notebook** (one per subject).
2. **Add sources:** drag in PDFs/DOCX/TXT/MD/images/audio, or paste text. Watch the status move `uploaded → extracting → chunking → embedding → ready`.
3. **Studio:** pick one of the 16 pipelines, set difficulty, length and an optional focus topic, and click Generate. The first run takes 10–90 s; repeats are instant (cached). Tick "force" to regenerate.
4. **Chat:** ask questions. Answers stream in with `[S1]` chips; click a chip to see the source, page and snippet.
5. **Search debug:** see what each retrieval layer returned for a query.

## 6. Tests, lint, eval

```bash
cd backend
pytest                      # 88 tests, no API key needed (fake LLM + fake embeddings)
ruff check app tests eval scripts
python -m eval.run_eval     # real retrieval metrics (needs GEMINI_API_KEY); writes eval/results.md
python -m eval.run_eval --skip-rerank   # faster: skips the LLM-rerank row
python -m scripts.reindex   # rebuild Chroma from Postgres (after changing EMBEDDING_MODEL)

cd ../frontend
npm test && npm run build
```

## 7. Configuration reference (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `LLM_MODEL` | `gemini-3.8-flash` | Generation/chat model (any current Gemini Flash name) |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model. Changing it needs `scripts.reindex` |
| `EMBEDDING_FALLBACK_MODEL` | *(empty)* | Tried automatically if the first model is rejected |
| `EMBEDDING_DIM` | `768` | Vector size (768/1536/3072) |
| `GEMINI_RPM` / `EMBED_RPM` | `10` / `100` | Client-side rate limits (free tier) |
| `RERANK_WITH_LLM` | `true` | LLM rerank of the top 10 (one extra call per query; raised MRR in the eval). Set `false` to save quota |
| `CHUNK_TARGET_TOKENS` / `CHUNK_OVERLAP_RATIO` | `600` / `0.15` | Chunking |
| `GENERATION_SINGLE_PASS_TOKENS` | `150000` | Above this, pipelines use map-reduce |
| `CHROMA_MODE` | `embedded` | `http` to use a Chroma server (`CHROMA_HOST`, `CHROMA_PORT`) |

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` shows `ai_configured: false` | `GEMINI_API_KEY` is missing in `backend/.env`; restart the backend |
| "rate-limited" errors | Free tier is ~10 requests/min for Flash. Wait a minute, lower `GEMINI_RPM`, or set `OPENAI_API_KEY` for fallback |
| Source stuck in `extracting`/`embedding` after a restart | Click **Retry** on the source |
| Source `failed: no readable text` | The file is empty or an image-only PDF over the OCR page limit (`MAX_OCR_PAGES`) |
| 401 in full mode | Frontend and backend point at different Supabase projects, or the session expired: sign in again |
| CORS error in the browser | Add the frontend URL to `CORS_ORIGINS` |
| Embedding model warning in the logs | The configured model was rejected and the fallback was used; see `/health` |
