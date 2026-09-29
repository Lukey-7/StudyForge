# ⚡ StudyForge

<div align="center">

**The Document-to-Study System Pipeline**

*A privacy-first, high-performance, and visually stunning alternative to NotebookLM.*

[![Go](https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Design](https://img.shields.io/badge/Design-Glassmorphism-violet)](./backend/frontend/DESIGN.md)

**Project URL:** [https://github.com/Lukey-7/StudyForge](https://github.com/Lukey-7/StudyForge)

</div>

---

## 🚀 What is StudyForge?

StudyForge is not just a "PDF chat app." It is a multi-layered **knowledge synthesis pipeline** designed for students and researchers who need to transform raw data into structured study systems. 

Built with a **Go backend** and a custom **Dark Glassmorphism frontend**, StudyForge provides a high-focus environment to ingest, cluster, and generate academic content using **Google Gemini 1.5 Flash**.

---

## ✨ Key Features

- 📚 **Multi-Modal Ingestion** - Upload PDFs, images (OCR), audio files (auto-transcription via Vosk), and video URLs.
- 📂 **Notebook Grouping** - Organize your sources into smart "Notebooks" with custom icons and colors.
- 🧠 **Study Intelligence** - Generate high-value assets:
  - 📝 **Summaries**: Distilled insights.
  - ❓ **FAQs**: Potential exam questions and answers.
  - ✍️ **Quizzes**: Interactive self-testing modules.
  - 📜 **Exam Notes**: Condensed, bulleted revision sheets.
- 📖 **Textbook Generation** - Compile all sources in a notebook into a cohesive, structured "Chapter" document.
- 💬 **RAG Chat** - Context-aware AI assistant that cites its sources directly from your library.
- 🎨 **Premium UI** - A sleek, high-focus interface using a dark glassmorphism design system.

---

## 🛠️ Technical Stack

- **Backend**: [Go](https://golang.org/) (Gin-Gonic, LangChainGo)
- **Frontend**: Vanilla JavaScript, HTML5, and CSS3 (No heavy frameworks).
- **AI Engine**: [Google Gemini 1.5 Flash](https://aistudio.google.com/) via OpenAI-compatible endpoint.
- **Embeddings**: Google `text-embedding-004`.
- **Database**: SQLite for metadata and source storage.
- **Design System**: Glassmorphism (Linear.app-inspired) with Inter & JetBrains Mono typography.

---

## 🚀 Quick Start

### Prerequisites

- Go 1.23 or later
- A Google Gemini API Key (get it from [AI Studio](https://aistudio.google.com/app/apikey))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Lukey-7/StudyForge.git
cd StudyForge

# 2. Configure Environment
cp .env.example .env

# 3. Install dependencies and run
go mod tidy
go run . -server
```

Open your browser to `http://localhost:8080`.

---

## ⚙️ Configuration

Edit your `.env` file to configure your AI engine. **Google Gemini** is highly recommended for its speed and context window.

```env
# Google Gemini Configuration
OPENAI_API_KEY=your-gemini-api-key-here
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-1.5-flash
EMBEDDING_MODEL=text-embedding-004
```

---

## 📂 Project Structure

- `backend/server.go`: Main API and routing logic.
- `backend/agent.go`: RAG and AI agent orchestration.
- `backend/frontend/`: The SPA shell and static assets.
- `docs/`: Technical documentation and project "Blackbook".

---

## 📄 License

Apache License 2.0 - see [LICENSE](./LICENSE) for details.

---

<div align="center">
  Made with ⚡ for the next generation of learners.
</div>
