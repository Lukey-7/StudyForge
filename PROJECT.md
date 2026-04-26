# StudyForge — Project Documentation

## What This Project Is

StudyForge is an end-to-end AI-powered study knowledge pipeline that transforms raw document uploads into structured, revision-ready study systems. Unlike simple "PDF chat" tools, StudyForge implements a multi-stage workflow: raw uploads → cleaned notes → grouped notebooks → generated textbook-style chapters → RAG-powered chat over everything. It is built on a high-performance Go backend with a premium dark glassmorphism frontend, powered by Google Gemini.

## Original Base

StudyForge is a fork of an open-source NotebookLM alternative, extended into a full-featured study knowledge pipeline. The following modifications were applied.

---

## Tech Stack

### Backend

| Layer | Technology | Purpose |
|---|---|---|
| Language | Go 1.25 | High-performance server-side logic |
| HTTP Framework | Gin-Gonic v1.10 | REST API routing, middleware, file uploads |
| LLM Client | LangChainGo v0.1.14 (openai driver) | OpenAI-compatible LLM calls to Gemini |
| AI Provider | Google Gemini via OpenAI-compatible endpoint | Text generation, embeddings, transformations |
| Image Generation | Google Gemini Image / GLM / ZImage (pluggable) | Infographic and PPT slide generation |
| Vector Store | SQLite (via modernc.org/sqlite v1.42.2) | Document chunk storage and similarity search |
| Data Store | SQLite | Notebooks, sources, notes, chat sessions, textbooks |
| Authentication | JWT (golang-jwt/v5) + OAuth2 (GitHub, Google) | User authentication and session management |
| Logging | golog + file-rotatelogs | Structured logging with daily rotation |
| Document Extraction | markitdown CLI (Python) | PDF, DOCX, PPTX, XLSX → Markdown conversion |
| Audio Transcription | Vosk Transcriber | Audio/video → text via offline speech recognition |

### Frontend

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Vanilla JavaScript SPA | Single-page app with view toggling (no React/Vue) |
| Structure | Single `index.html` + `app.js` + `style.css` | Embedded in Go binary via `//go:embed` |
| Styling | CSS Custom Properties | Design system tokens, glassmorphism components |
| Typography | Google Fonts (Inter, JetBrains Mono) | Professional academic typography |
| Markdown Rendering | Client-side Markdown parser | Renders notes, textbooks, and chat responses |
| Build | Static files (no bundler required) | Served directly by Go embed |

### AI / LLM

| Layer | Technology | Purpose |
|---|---|---|
| Text Generation | Google Gemini 2.5 Flash | Transformations, chat, textbook generation |
| Embeddings | Google text-embedding-004 | Document chunking and similarity search |
| API Pattern | OpenAI-compatible endpoint | Zero code changes needed — config swap only |
| Image Generation | Gemini 3.1 Flash Image Preview | Infographic and presentation slide creation |

### Design

| Layer | Technology | Purpose |
|---|---|---|
| Design System | DESIGN.md (token specification) | Single source of truth for all visual decisions |
| Design Tool | Google Stitch (Project ID: 4870257180990223976) | UI prototype generation for 5 screen types |
| Theme | Dark Glassmorphism (Linear.app-inspired) | Premium, high-focus academic environment |
| Fonts | Inter (UI) + JetBrains Mono (code) | Clean, modern typography |

### Infrastructure

| Layer | Technology | Purpose |
|---|---|---|
| Database | SQLite (two files: vector.db + checkpoints.db) | Zero-config embedded storage |
| File Storage | Local filesystem (`./data/uploads/`) | User-uploaded documents per user ID |
| Server | Single Go binary | Self-contained — no Docker, Nginx, or reverse proxy needed |
| Config | `.env` file (godotenv) | Environment-based configuration |

---

## What We Changed From the Original

| Feature | Original Codebase | StudyForge |
|---|---|---|
| LLM Provider | OpenAI / Ollama multi-provider | Google Gemini only (via OpenAI-compatible endpoint) |
| App name | NoteX | StudyForge |
| Language | Chinese UI + English | Fully English |
| Ollama support | Present (optional local provider) | Removed entirely — Gemini only |
| Transformation modes | summary, faq, study_guide, outline, podcast, timeline, glossary, quiz, mindmap, infograph, ppt, custom, insight, data_table, data_chart | All original modes preserved + added: **Exam Notes** |
| Notebooks | Basic notebook CRUD (from original) | Extended with Color, Icon, SourceIDs, public sharing |
| Textbook generation | Not present | Added: compile notebook sources into structured 5-chapter documents |
| Live textbook updates | Not present | Added: auto-stale detection when sources update, regeneration flow |
| Frontend theme | Light/green WeChat-inspired design | Dark glassmorphism theme via DESIGN.md (Google Stitch) |
| Animations | Three.js starfield and particles | Removed entirely — clean, static design |

---

## New Features Built

### 1. Gemini API Integration

The LLM provider was swapped from OpenAI/Ollama to Google Gemini using Gemini's OpenAI-compatible endpoint. This required zero changes to Go HTTP client logic — only environment variable configuration was updated. The `OPENAI_BASE_URL` is pointed at `https://generativelanguage.googleapis.com/v1beta/openai`, which allows the existing `langchaingo/llms/openai` driver to communicate with Gemini transparently.

### 2. Exam Notes Mode

A new transformation mode called "Exam Notes" (`exam_notes`) was added following the exact pattern of existing modes. It generates ultra-compressed bullet-point revision notes with bold key terms and exactly 5 likely exam questions. The prompt strategy prioritises compression over explanation, making it ideal for last-minute revision.

### 3. Notebook System

The notebook feature was extended with `Color`, `Icon`, and `SourceIDs` fields, enabling users to create visually distinct, colour-coded collections. Full CRUD API endpoints were added following existing handler patterns, plus public sharing via unique tokens for the community showcase page.

### 4. Textbook Generation

A two-endpoint pipeline (`POST /generate` + `GET /textbook`) allows users to compile all sources in a notebook into a structured 5-chapter Markdown textbook. The generation runs asynchronously in a goroutine, with status tracking (`regenerating` → `current`). The prompt enforces strict structure: Introduction, Core Concepts, Definitions, Applications, and Summary with 10 revision questions.

### 5. Live Textbook Updates

When any source linked to a notebook finishes processing, the system checks if that notebook has an existing textbook. If yes, the textbook's status is automatically marked as `stale`. The frontend polls for status changes every 5 seconds and shows a banner with [Regenerate Now] and [Dismiss] buttons.

### 6. Glassmorphism Theme via Google Stitch + DESIGN.md

Five UI screens were designed in Google Stitch (Dashboard, Documents, Document Detail, Notebooks, AI Chat). The design was exported as DESIGN.md — a comprehensive token specification covering colours, typography, spacing, radii, and component specs. All CSS was rewritten using custom properties from DESIGN.md: `#09090B` background, violet `#8B5CF6` accent, `backdrop-filter: blur(16px)` glass cards, Inter typography. All Three.js, starfield, and particle animations were removed.

---

## API Endpoints

### Original Endpoints (preserved)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Serve frontend SPA |
| GET | `/notes/:id` | Shareable notebook link |
| GET | `/auth/login/:provider` | OAuth login (GitHub/Google) |
| GET | `/auth/callback/:provider` | OAuth callback |
| GET | `/auth/test-mode` | Test mode auth |
| POST | `/auth/test-login` | Test mode login |
| GET | `/api/health` | Health check |
| GET | `/api/config` | Client configuration |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/notebooks` | List notebooks |
| GET | `/api/notebooks/stats` | List notebooks with stats |
| POST | `/api/notebooks` | Create notebook |
| GET | `/api/notebooks/:id` | Get notebook |
| PUT | `/api/notebooks/:id` | Update notebook |
| DELETE | `/api/notebooks/:id` | Delete notebook |
| PUT | `/api/notebooks/:id/public` | Set notebook public status |
| GET | `/api/notebooks/:id/sources` | List sources |
| GET | `/api/notebooks/:id/sources/:sourceId` | Get source |
| POST | `/api/notebooks/:id/sources` | Add source |
| DELETE | `/api/notebooks/:id/sources/:sourceId` | Delete source |
| GET | `/api/notebooks/:id/notes` | List notes |
| POST | `/api/notebooks/:id/notes` | Create note |
| DELETE | `/api/notebooks/:id/notes/:noteId` | Delete note |
| POST | `/api/notebooks/:id/transform` | Generate transformation |
| POST | `/api/notebooks/:id/chat` | Quick chat (auto-session) |
| GET | `/api/notebooks/:id/chat/sessions` | List chat sessions |
| POST | `/api/notebooks/:id/chat/sessions` | Create chat session |
| GET | `/api/notebooks/:id/chat/sessions/:sessionId` | Get chat session |
| DELETE | `/api/notebooks/:id/chat/sessions/:sessionId` | Delete chat session |
| POST | `/api/notebooks/:id/chat/sessions/:sessionId/messages` | Send message |
| GET | `/api/notebooks/:id/overview` | Notebook overview |
| POST | `/api/upload` | Upload file |
| GET | `/api/sources/:id` | Get source by ID |
| GET | `/api/files/:filename` | Serve uploaded file |
| GET | `/public/notebooks` | List public notebooks |
| GET | `/public/notebooks/:token` | Get public notebook |
| GET | `/public/notebooks/:token/sources` | Public notebook sources |
| GET | `/public/notebooks/:token/sources/:sourceId` | Public source detail |
| GET | `/public/notebooks/:token/notes` | Public notebook notes |
| GET | `/api/v2/infograph/styles` | List infographic styles |

### New Endpoints Added

| Method | Path | Description | Task |
|---|---|---|---|
| GET | `/api/v1/notebooks/:id/textbook` | Retrieve generated textbook | Task 10 |
| POST | `/api/v1/notebooks/:id/textbook/generate` | Trigger textbook generation | Task 10 |

### Transformation Modes (via POST `/api/notebooks/:id/transform`)

| Type Key | Name | Description |
|---|---|---|
| `summary` | Summary | Comprehensive distilled summary |
| `faq` | FAQ | 10-15 questions and answers |
| `study_guide` | Study Guide | Learning objectives, concepts, exercises |
| `outline` | Outline | Hierarchical structured outline |
| `podcast` | Podcast | Two-host conversational script |
| `timeline` | Timeline | Chronological event ordering |
| `glossary` | Glossary | Terms and definitions |
| `quiz` | Quiz | Mixed question types with answer key |
| `mindmap` | Mind Map | Mermaid.js mindmap diagram |
| `infograph` | Infographic | AI-generated visual infographic |
| `ppt` | Presentation | Multi-slide presentation outline |
| `custom` | Custom | User-defined prompt |
| `insight` | Deep Insight | Summary → DeepInsight CLI analysis |
| `data_table` | Data Table | Structured tabular extraction |
| `data_chart` | Data Chart | ECharts visualization config |
| `exam_notes` | **Exam Notes** ⭐ | Ultra-compressed revision bullets + 5 exam questions |

---

## Environment Variables

```env
# StudyForge Configuration
# Copy this file to .env and fill in your values

# ===========================================
# LLM Provider (Google Gemini recommended)
# ===========================================
OPENAI_API_KEY=your-gemini-api-key-here
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=text-embedding-004

# Google API Key (for image generation)
GOOGLE_API_KEY=your-google-api-key-here

# ===========================================
# Server Configuration
# ===========================================
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# ===========================================
# Vector Store
# ===========================================
VECTOR_STORE_TYPE=sqlite
SQLITE_PATH=./data/vector.db

# ===========================================
# Data Store
# ===========================================
STORE_TYPE=sqlite
STORE_PATH=./data/checkpoints.db

# ===========================================
# Agent Configuration
# ===========================================
MAX_SOURCES=5
MAX_CONTEXT_LENGTH=128000
CHUNK_SIZE=1000
CHUNK_OVERLAP=200

# ===========================================
# Document Conversion
# ===========================================
ENABLE_MARKITDOWN=true

# ===========================================
# Audio Transcription
# ===========================================
ENABLE_VOSK_TRANSCRIBER=true
VOSK_MODEL_PATH=/root/.cache/vosk/vosk-model-small-en-us-0.15

# ===========================================
# Auth Configuration
# ===========================================
JWT_SECRET=your-secret-key-change-me-in-production

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URL=http://localhost:8080/auth/github/callback

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URL=http://localhost:8080/auth/google/callback

# ===========================================
# Image Generation
# ===========================================
IMAGE_PROVIDER=gemini
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview

# ===========================================
# Test Mode (development only)
# ===========================================
ENABLE_TEST_MODE=false
TEST_USER_ID=test-user-123
TEST_USER_NAME=Test User
TEST_USER_EMAIL=test@example.com

# ===========================================
# Notes Configuration
# ===========================================
ALLOW_MULTIPLE_NOTES_OF_SAME_TYPE=true
```

---

## How to Run

```bash
# Clone
git clone https://github.com/Lukey-7/StudyForge.git
cd StudyForge

# Set up environment
cp .env.example .env
# Edit .env — add your Gemini API key from https://aistudio.google.com

# Run the server (serves both backend API and frontend)
go run . -server

# Access the app
# http://localhost:8080
```

### CLI Mode (Ingest files without the UI)

```bash
# Ingest a single file into a notebook
go run . -ingest document.pdf -notebook "My Notes"
```

### Build for Production

```bash
go build -o studyforge .
./studyforge -server
```

---

## Gemini Free Tier Limits

| Model | Rate Limit | Daily Limit |
|---|---|---|
| gemini-2.5-flash | 15 req/min | 1500 req/day |
| gemini-1.5-pro | 2 req/min | 50 req/day |
| text-embedding-004 | — | 1500 req/day |

Get your free API key at [https://aistudio.google.com](https://aistudio.google.com).

---

## Project File Structure

```
StudyForge/
├── main.go                     # Entry point — CLI flags, server startup
├── AGENTS.md                   # AI agent rules (do not modify Go core)
├── PROJECT.md                  # This file
├── README.md                   # GitHub readme
├── .env.example                # Configuration template
├── go.mod / go.sum             # Go dependencies
│
├── backend/
│   ├── server.go               # HTTP routes, handlers (2035 lines)
│   ├── agent.go                # RAG agent, transformations, textbook gen
│   ├── prompt.go               # All 16 transformation prompt templates
│   ├── store.go                # SQLite data access layer (58K)
│   ├── vector.go               # Vector store, embeddings, similarity search
│   ├── types.go                # All data models (User, Source, Note, Notebook, Textbook, etc.)
│   ├── config.go               # Environment variable loading and validation
│   ├── auth.go                 # JWT + OAuth2 authentication
│   ├── middleware.go           # Auth, audit, and CORS middleware
│   ├── memory.go               # Chat memory management with LLM summaries
│   ├── cache.go                # In-memory cache layer for store
│   ├── gemini.go               # Gemini-specific LLM provider
│   ├── glm_image.go            # GLM image generation provider
│   ├── z_image.go              # ZImage generation provider
│   ├── infograph_styles.go     # 20+ infographic visual styles
│   ├── utils.go                # Shared utilities
│   │
│   └── frontend/
│       ├── DESIGN.md           # Design system token specification
│       ├── index.html          # SPA shell (62K — all views in one file)
│       ├── favicon.svg         # App icon
│       └── static/
│           ├── app.js          # All application logic (~4000 lines)
│           └── style.css       # All styles (~4700 lines)
│
├── docs/                       # Technical documentation
├── data/                       # Runtime data (gitignored)
│   ├── vector.db               # Vector store database
│   ├── checkpoints.db          # App data database
│   └── uploads/                # User-uploaded files
└── logs/                       # Server logs (gitignored)
```

---

## Acknowledgements

- **Original project**: Open-source NotebookLM alternative
- **AI Engine**: Google Gemini via [AI Studio](https://aistudio.google.com)
- **Design Tool**: [Google Stitch](https://stitch.withgoogle.com)
- **LLM Framework**: [LangChainGo](https://github.com/tmc/langchaingo)
