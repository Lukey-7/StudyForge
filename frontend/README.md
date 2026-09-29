# StudyForge frontend

React 19 + Vite, plain JavaScript (JSX) and plain CSS. Talks to the FastAPI backend described in `../docs/API.md`.

## Run

```bash
cd frontend
cp .env.example .env        # edit if needed
npm install
npm run dev                 # http://localhost:5173
```

Start the backend too (from `backend/`):

```bash
.venv/Scripts/python -m uvicorn app.main:create_app --factory --port 8080
```

**Demo mode:** leave `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` empty. There is no login screen and
requests carry no `Authorization` header (the backend's `AUTH_MODE=dev` accepts that).
Set both to use real Supabase email/password auth.

Other scripts: `npm run build` (production build into `dist/`), `npm run preview`, `npm test` (SSE parser tests).

## Where things live

| Path | What |
|---|---|
| `src/App.jsx` | router, React Query provider, login gate |
| `src/lib/api.js` | fetch wrapper (base URL, Bearer token, `{detail}` errors → `Error`) |
| `src/lib/sse.js` | POST + stream reader that parses `event:`/`data:` frames (chat) |
| `src/lib/supabase.js` | Supabase client, or `null` in demo mode |
| `src/pages/` | Login, notebook list, notebook workspace |
| `src/components/` | Sources, Studio (pipelines, history, retrieval debugger), Chat |
| `src/components/outputs/` | one renderer per pipeline output shape |
| `src/styles/tokens.css` | design tokens (colors, spacing, radii, fonts) |
| `src/styles/app.css` | all component styles + responsive rules |

State: React Query for anything from the server, `useState` for UI-only state.
