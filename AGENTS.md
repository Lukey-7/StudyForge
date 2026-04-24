# AGENTS.md — StudyForge (forked from notex)

## Project Overview
This is a Go + React full-stack app — an open-source NotebookLM alternative being
extended into StudyForge, a document-to-study-system pipeline.

Backend: Go (do NOT rewrite backend logic — only modify config, env vars, and add new endpoints following existing patterns)
Frontend: Vanilla HTML/CSS/JS SPA at `backend/frontend/` (can be modified freely — theming, new components)
  - `index.html` — single-page app shell (all views toggled via JS)
  - `static/style.css` — all styles (4600+ lines)
  - `static/app.js` — all application logic

## Frontend Pages & Views
The frontend is a single `index.html` with views toggled by JavaScript (no router).

| View / Section           | DOM ID / Selector           | Description |
|--------------------------|----------------------------|-------------|
| **Landing / Notebooks**  | `#landingPage`             | Notebook grid, public showcase, "New Notebook" button |
| **Workspace**            | `#workspaceContainer`      | 3-panel layout: Sources + Chat + Studio/Notes |
| ├─ Sources Panel         | `.panel-left`              | File list, add source button |
| ├─ Chat Panel            | `.panel-center`            | Chat messages, session history, notes list tabs |
| ├─ Studio Panel          | `.panel-right`             | Transform cards (Summary, FAQ, Quiz, etc.) + Notes list |
| **Modals**               | `#modalOverlay`            | New Notebook, Add Source, Share Notebook |
| **Header**               | `.app-header`              | Logo, GitHub link, auth |
| **Footer**               | `.app-footer`              | Status, credits |

### Stitch Design Reference (Project ID: 4870257180990223976)
| Screen            | Purpose |
|-------------------|---------|
| Dashboard         | Stats cards, upload zone, recent uploads |
| Documents         | Grid of document cards with status badges |
| Document Detail   | Extracted text + AI Insights + mode selector tabs |
| Notebooks         | Grid of notebook cards with descriptions and stats |
| AI Chat           | Sidebar conversations + main chat area |

## Critical Rules
- NEVER rewrite or restructure the core Go backend pipeline (ingestion, OCR, embedding, RAG)
- NEVER change go.mod or remove Go dependencies without asking first
- ALWAYS follow the existing patterns in the codebase when adding new features
- ALWAYS show me the diff before applying changes to Go files
- Frontend changes can be applied freely
- Ask before running `go build` or `go mod tidy`

## What We Are Building
Modifying notex → StudyForge:
1. Swap LLM from OpenAI to Google Gemini (via OpenAI-compatible endpoint)
2. Rename app to StudyForge in UI and config
3. Add Exam Notes as a 4th transformation mode
4. Add Notebook grouping (group sources into a named notebook)
5. Add basic Textbook generation (compile notebook notes into a chapter document)
6. Retheme frontend: dark glassmorphism design

## Design System
The frontend uses a glassmorphism dark theme. Full token spec is in DESIGN.md
in the frontend root. Read DESIGN.md before writing ANY frontend code.
Summary of tokens:
Background:        #09090B
Card bg:           rgba(24, 24, 27, 0.80) + backdrop-filter: blur(16px)
Card border:       1px solid rgba(255, 255, 255, 0.06)
Card hover border: rgba(139, 92, 246, 0.30)
Card hover shadow: 0 0 24px rgba(139, 92, 246, 0.10)
Accent primary:    #8B5CF6 (violet-500)
Accent hover:      #7C3AED
Text primary:      #FAFAFA
Text secondary:    #A1A1AA
Text muted:        #52525B
Success:           #34D399
Warning:           #FBBF24
Error:             #F87171
Font:              Inter (Google Fonts)
Mono:              JetBrains Mono (Google Fonts)
Card radius:       12px
Button radius:     8px
Transition:        all 200ms ease
Body gradient:     radial-gradient top-left rgba(139,92,246,0.12)
+ radial-gradient bottom-right rgba(96,165,250,0.08)
fixed, no-repeat
NO Three.js. NO starfield. NO particle animations.

## How to Run
Backend:  go run . -server
Frontend: cd frontend && npm run dev

## Verification Commands
go build ./...     (must pass with zero errors after every backend change)
npm run build      (must pass with zero errors after every frontend change)

## LLM Config (env vars)
OPENAI_API_KEY     = your Gemini API key
OPENAI_BASE_URL    = https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL       = gemini-1.5-flash
EMBEDDING_MODEL    = text-embedding-004

## Content Spec

It is not just a "PDF chat app".

It is a **study knowledge pipeline**:

raw uploads → cleaned notes → grouped notebooks → generated textbook-style chapters → RAG chat over everything

That layered design is the whole product.