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

Other scripts: `npm run build` (production build into `dist/`), `npm run preview`, `npm test` (unit tests).

## Where things live

| Path | What |
|---|---|
| `src/App.jsx` | router (landing, login, notebooks), React Query and toast providers, login gate |
| `src/landing/` | public landing page, the format demo and its hand-written samples (`samples.js`) |
| `src/lib/api.js` | fetch wrapper (base URL, Bearer token, `{detail}` errors -> `Error`) |
| `src/lib/sse.js` | POST + stream reader that parses `event:`/`data:` frames (chat) |
| `src/lib/supabase.js` | Supabase client, or `null` in demo mode |
| `src/lib/formats.js` | the 16 formats grouped by goal, with friendly labels |
| `src/lib/exportMarkdown.js` | output -> Markdown, flashcards -> Anki CSV |
| `src/lib/flashcardDeck.js` | "Got it" / "Again" deck logic (pure, tested) |
| `src/lib/suggestions.js` | suggested chat questions from the notes' headings |
| `src/pages/` | login, notebook list, notebook workspace |
| `src/components/` | Sources, Studio (format picker, history, retrieval debugger), Chat, source reader, toasts |
| `src/components/outputs/` | one renderer per pipeline output shape |
| `src/styles/` | `tokens.css` (design tokens) + one stylesheet per area; see `DESIGN.md` |

Routes: `/` shows the landing page when signed out and your notebooks when signed in; `/welcome` always shows
the landing page (the "Home" link); `/login?mode=signup` opens account creation.

State: React Query for anything from the server, `useState` for UI-only state, `localStorage` only for
flashcard progress (best effort).

`npm test` runs the SSE parser, Markdown/CSV export, flashcard deck and suggestion tests.
