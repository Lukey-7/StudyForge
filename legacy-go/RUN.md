# 🚀 StudyForge — Run Guide

> **One-command startup** for Windows, macOS, and Linux.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Go** | 1.23+ | [go.dev/dl](https://go.dev/dl/) |
| **Gemini API Key** | — | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

Optional (for full feature set):

| Tool | Purpose | Install |
|------|---------|---------|
| `markitdown` | PDF/DOCX/PPTX conversion | `pip install markitdown` |
| `vosk-transcriber` | Audio transcription | [github.com/alphacep/vosk-transcriber](https://github.com/alphacep/vosk-transcriber) |

---

## Quick Start (3 steps)

### 1. Clone & enter the project

```bash
git clone https://github.com/Lukey-7/StudyForge.git
cd StudyForge
```

### 2. Create your `.env` file

Copy the example and add your Gemini key — that's the only required value:

```bash
cp .env.example .env
```

Then open `.env` and replace the placeholder:

```env
OPENAI_API_KEY=your-actual-gemini-key-here
GOOGLE_API_KEY=your-actual-gemini-key-here
```

> **Tip:** Both keys can be the same Gemini API key.

### 3. Run it

```bash
go run . -server
```

That's it. Open **http://localhost:8080** in your browser.

You should see output like:

```
✅ StudyForge v1.0.0
📡 Server: http://0.0.0.0:8080
🤖 LLM: gemini-2.5-flash
📦 Vector Store: sqlite
```

---

## One-Liner (if `.env` already exists)

```bash
go run . -server
```

---

## Build & Run as Binary

If you prefer a compiled binary:

```bash
# Build
go build -o studyforge.exe .

# Run
./studyforge.exe -server
```

On macOS/Linux, omit the `.exe`:

```bash
go build -o studyforge .
./studyforge -server
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `go run . -server` | Start the web server on port 8080 |
| `go run . -ingest <file>` | Ingest a file into the vector store |
| `go run . -ingest <file> -notebook "My Notes"` | Ingest into a specific notebook |
| `go run . -version` | Print version info |

---

## Environment Variables

### Required

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | Your Gemini API key |

### Recommended (already set in `.env.example`)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` | Gemini endpoint |
| `OPENAI_MODEL` | `gemini-2.5-flash` | LLM model |
| `EMBEDDING_MODEL` | `text-embedding-004` | Embedding model |
| `GOOGLE_API_KEY` | *(same as above)* | Used for infographics |
| `SERVER_PORT` | `8080` | HTTP port |
| `VECTOR_STORE_TYPE` | `sqlite` | Vector store backend |
| `IMAGE_PROVIDER` | `gemini` | Image generation backend |

### Development / Testing

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_TEST_MODE` | `false` | Skip auth (dev only) |
| `TEST_USER_NAME` | `Test User` | Display name in test mode |
| `ENABLE_MARKITDOWN` | `true` | Enable PDF/DOCX converter |

See [`.env.example`](.env.example) for the full list with descriptions.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Configuration Error: OPENAI_API_KEY` | Make sure `.env` exists and has your key |
| Port 8080 already in use | Change `SERVER_PORT=9090` in `.env` |
| `go: module not found` | Run `go mod tidy` first |
| PDF upload doesn't extract text | Install `markitdown`: `pip install markitdown` |
| Audio files not transcribed | Install `vosk-transcriber` and set `VOSK_MODEL_PATH` |

---

## Project Layout

```
StudyForge/
├── main.go              # Entry point (flags, server boot)
├── .env                 # Your config (not tracked in git)
├── .env.example         # Template with all options
├── backend/
│   ├── server.go        # HTTP API routes
│   ├── agent.go         # RAG + AI orchestration
│   ├── vector.go        # Embedding & similarity search
│   └── frontend/        # SPA (index.html + static/)
├── data/                # SQLite databases (auto-created)
└── logs/                # Log files (auto-created)
```

---

<div align="center">

**TL;DR:** `cp .env.example .env` → add your key → `go run . -server` → open `localhost:8080`

</div>
