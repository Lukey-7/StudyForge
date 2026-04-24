# StudyForge: Project Blackbook

StudyForge is a state-of-the-art **document-to-study-system pipeline**. It transforms raw information (PDFs, URLs, Audio, Notes) into a structured, AI-enhanced knowledge base, culminating in generated textbooks and an interactive RAG-powered study assistant.

## 🚀 Project Vision
Moving beyond simple "PDF chat" apps, StudyForge is designed as a multi-layered knowledge synthesis platform.
- **Ingest**: Multi-modal source intake (OCR, URL scraping, Audio transcription).
- **Synthesize**: Transformation of raw data into high-value study assets (Summaries, FAQs, Quizzes).
- **Structure**: Grouping sources into logical "Notebooks."
- **Generate**: Compiling all synthesis into a cohesive, textbook-style chapter.
- **Interact**: Conversational RAG over the entire notebook context.

---

## 🛠️ Technical Stack

### Backend: Go (Golang)
- **Framework**: `Gin-Gonic` for high-performance HTTP routing.
- **LLM Integration**: `LangChainGo` interface connected to **Google Gemini 1.5 Flash**.
- **Database**: SQLite for relational data (Notebooks, Sources, User metadata).
- **Vector Engine**: Integrated vector store for RAG (Retrieval-Augmented Generation).
- **Processing**: Async task queue for OCR and heavy AI transformations.

### Frontend: Vanilla JavaScript SPA
- **Aesthetic**: Dark Glassmorphism (Linear.app-inspired).
- **Styling**: Vanilla CSS with a strict design token system.
- **Architecture**: Single-page application shell with state-driven view toggling.
- **Typography**: Inter (UI) and JetBrains Mono (Code/Status).

### AI & Models
- **Main LLM**: `gemini-1.5-flash` (via OpenAI-compatible endpoint).
- **Embeddings**: `text-embedding-004` (Google).
- **Context Management**: Custom `MemoryManager` for long-term chat session history.

---

## 🔄 The Pipeline: How it Works

### 1. Ingestion Layer
- **File Upload**: Handles PDFs and images with automatic OCR processing.
- **Web Scraping**: Extracts clean text from URLs.
- **Audio/Video**: Transcribes media into readable study text using `vosk-transcriber`.
- **Vectorization**: Content is chunked and embedded into a vector space for semantic search.

### 2. Transformation Engine (The "Studio")
The Studio applies targeted prompts to the source material to create:
- **Summaries**: High-level distilled info.
- **FAQs**: Potential questions and detailed answers.
- **Quizzes**: Interactive self-testing modules.
- **Exam Notes**: Condensed, bulleted study sheets for quick revision.

### 3. Textbook Generation
This is the pinnacle of the pipeline. StudyForge takes multiple sources within a Notebook, identifies key themes, and compiles them into a structured "Chapter" document, complete with an introduction, body, and conclusion—formatted like a real textbook.

### 4. RAG Chat System
A Retrieval-Augmented Generation system that allows users to ask questions across their entire library.
- **Retrieval**: Finds the most relevant chunks from all sources.
- **Augmentation**: Injects that context into the Gemini prompt.
- **Generation**: Produces answers grounded strictly in the provided study material.

---

## 🎨 Design System (Visual Identity)
StudyForge uses a **Dark Glassmorphism** theme designed for "Calm Authority."

- **Background**: `#09090B` with subtle radial gradients (Violet/Blue).
- **Surfaces**: `rgba(24, 24, 27, 0.80)` with `16px` backdrop-blur.
- **Accents**: Violet-500 (`#8B5CF6`) for primary actions.
- **Interactive**: Smooth 200ms transitions on all hover states.
- **Cards**: 1px subtle borders (`rgba(255, 255, 255, 0.06)`) that glow on hover.

---

## 📂 Project Structure
```text
studyforge/
├── backend/
│   ├── server.go       # API Routes & HTTP Logic
│   ├── agent.go        # RAG & AI Agent Core
│   ├── store.go        # SQLite Data Layer
│   ├── vector.go       # Embedding & Vector Search
│   ├── prompt.go       # AI Persona & Templates
│   └── frontend/       # SPA (Vanilla HTML/CSS/JS)
├── data/
│   ├── uploads/        # User-uploaded documents
│   └── store.db        # SQLite database
└── AGENTS.md           # Engineering guidelines
```
