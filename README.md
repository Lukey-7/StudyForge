# StudyForge

<div align="center">

**A privacy-first, open-source alternative to NotebookLM**

[![Go](https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)

An AI-powered knowledge management application that lets you create intelligent notebooks from your documents.

**Project URL:** https://github.com/smallnest/notex

![](docs/note2.png)

</div>

- Python clone: [pynotex](https://github.com/Beeta/pynotex)

## ✨ Features

- 📚 **Multiple Source Types** - Upload PDFs, text files, Markdown, DOCX, HTML documents, audio files (MP3, WAV, M4A, etc.), and video URLs (YouTube, Bilibili with automatic subtitle extraction)
- 🤖 **AI-Powered Chat** - Ask questions and get answers based on your sources
- ✨ **Multiple Transformations** - Generate summaries, FAQs, study guides, outlines, timelines, glossaries, quizzes, mindmaps, infographics and podcast scripts
- 📊 **Infographic Generation** - Create beautiful, hand-drawn style infographics from your content using Google's Gemini Nano Banana
- 🎙️ **Podcast Generation** - Create engaging podcast scripts from your content
- 💾 **Full Privacy** - Local SQLite storage, optional cloud backends
- 🔄 **Multi-Model Support** - Works with Google Gemini, OpenAI, and other compatible APIs
- 🎨 **Academic Brutalist Design** - Distinctive, research-focused interface

## 🚀 Quick Start

### Prerequisites

- Go 1.23 or later
- An LLM API key (Google Gemini recommended, or OpenAI)
- [markitdown](https://github.com/microsoft/markitdown) (optional, for better document conversion)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (optional, for extracting subtitles from YouTube and Bilibili videos)
- [vosk-transcriber](https://github.com/alphacep/vosk-transcriber) (optional, for transcribing audio files to text)

### Installation

```bash
# Clone the repository
git clone https://github.com/smallnest/notex.git
cd notex

# Install dependencies
go mod tidy

# Run the server
go run . -server
```

Open your browser to `http://localhost:8080`

## ⚙️ Configuration

StudyForge uses environment variables for configuration. The recommended way to configure the application is to create a `.env` file.

### Step 1: Create Configuration File

Copy the example configuration file to create your local configuration:

```bash
cp .env.example .env
```

### Step 2: Configure Your LLM Provider

Edit the `.env` file and configure **one** of the following LLM providers:

#### Option A: Using Google Gemini (Recommended)

Google Gemini provides excellent models with a generous free tier. This app connects to Gemini using its **OpenAI-compatible endpoint**, so no Go code changes are needed.

1. Get an API key from [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Edit `.env` and configure:

```env
# Google Gemini via OpenAI-compatible endpoint
OPENAI_API_KEY=your-gemini-api-key-here
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-1.5-flash
EMBEDDING_MODEL=text-embedding-004
```

**Available Gemini Models:**

- `gemini-1.5-flash` - Fast and cost-effective (recommended)
- `gemini-1.5-pro` - Most capable
- `gemini-2.0-flash` - Latest generation

> **Note:** The `OPENAI_*` variable names are kept for backward compatibility — they work with any OpenAI-compatible API.

#### Option B: Using OpenAI (Cloud-based)

OpenAI provides high-quality models but requires an API key and charges per usage.

1. Get an API key from [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Edit `.env` and configure:

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
```

**Available OpenAI Models:**

- `gpt-4o-mini` - Fast and cost-effective (recommended)
- `gpt-4o` - Most capable
- `gpt-3.5-turbo` - Legacy option

**Tips:**

- You can also use compatible OpenAI APIs like Azure OpenAI or other providers by changing `OPENAI_BASE_URL`
- For example, to use DeepSeek: `OPENAI_BASE_URL=https://api.deepseek.com/v1` and `OPENAI_MODEL=deepseek-chat`


### Step 3: Optional — Google API Key for Infographics

If you are using **Gemini as your LLM** (Option A), infographic generation will use the same API key automatically via `OPENAI_API_KEY`.

If you are using **OpenAI** as your LLM but still want Gemini-powered infographics, set a separate key:

```env
GOOGLE_API_KEY=your-google-api-key-here
```

Get your key from [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

### Step 4: Run the Application

After configuring your `.env` file, simply run:

```bash
go run . -server
```

The application will automatically load your `.env` configuration and start at `http://localhost:8080`

### Build and Run (Optional)

If you prefer to build a binary instead of using `go run`:

```bash
go build -o notex .
./notex -server
```

## 📖 Usage

### Creating Notebooks

1. Click "New Notebook" in the header
2. Enter a name and optional description
3. Click "Create Notebook"

### Adding Sources

You can add content to your notebook in three ways:

**File Upload**

- Click the "+" button in the Sources panel
- Drag and drop or browse for files
- Supported: PDF, TXT, MD, DOCX, HTML
- Audio files: MP3, WAV, M4A, AAC, FLAC, OGG, WMA, OPUS (auto-transcribed to text)

**Paste Text**

- Select the "Text" tab
- Enter a title and paste your content

**From URL**

- Select the "URL" tab
- Enter the URL and optional title
- Supports web pages and video URLs (YouTube, Bilibili)
- For videos, subtitles are automatically extracted and used as content

### Chatting with Sources

1. Switch to the "CHAT" tab
2. Ask questions about your content
3. Responses include references to relevant sources

### Transformations

Click any transformation card to generate:

| Transformation | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| 📝 Summary     | Condensed overview of your sources                           |
| ❓ FAQ         | Common questions and answers                                 |
| 📚 Study Guide | Educational material with learning objectives                |
| 🗂️ Outline     | Hierarchical structure of topics                             |
| 🎙️ Podcast     | Conversational script for audio content                      |
| 📅 Timeline    | Chronological events from sources                            |
| 📖 Glossary    | Key terms and definitions                                    |
| ✍️ Quiz        | Assessment questions with answer key                         |
| 📊 Infographic | Hand-drawn style visual representation of your content       |
| 🧠 Mindmap     | Visual hierarchical diagram of your sources using Mermaid.js |

Or use the custom prompt field for any other transformation.

### Additional Configuration Options

For advanced users, the `.env` file supports additional configuration options:

```env
# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# Vector Store (default: sqlite)
# Options: sqlite, memory, supabase, postgres, redis
VECTOR_STORE_TYPE=sqlite

# RAG Processing
MAX_SOURCES=5          # Maximum sources to retrieve for context
CHUNK_SIZE=1000        # Document chunk size for processing
CHUNK_OVERLAP=200      # Overlap between chunks

# Document Conversion
ENABLE_MARKITDOWN=true  # Use Microsoft markitdown for better PDF/DOCX conversion

# Audio Transcription
ENABLE_VOSK_TRANSCRIBER=false  # Enable audio file transcription
VOSK_MODEL_PATH=/usr/local/share/vosk-model-en  # Path to vosk model

# Podcast Generation
ENABLE_PODCAST=true
PODCAST_VOICE=alloy    # Options: alloy, echo, fable, onyx, nova, shimmer

# Feature Flags
ALLOW_DELETE=true
ALLOW_MULTIPLE_NOTES_OF_SAME_TYPE=true
```

## 🔧 Development

### Running Tests

```bash
go test -v ./...
```

### Building

```bash
go build -o notex .
```

### Code Quality

```bash
# Format
go fmt ./...

# Lint
golangci-lint run

# Vet
go vet ./...
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

Apache License 2.0 - see [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- Inspired by [Google's NotebookLM](https://notebooklm.google.com/)
- Built with [LangGraphGo](https://github.com/smallnest/langgraphgo)
- Inspired by [notex](https://github.com/lfnovo/notex)

## 📞 Support

- Report issues on [GitHub](https://github.com/smallnest/notex/issues)
- Join discussions in the [StudyForge community](https://github.com/smallnest/notex/discussions)

---

**StudyForge** - A privacy-first, open-source alternative to NotebookLM
https://github.com/smallnest/notex
