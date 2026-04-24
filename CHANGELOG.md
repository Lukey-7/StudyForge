# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Audio Transcription** (#30, #19): Support for audio file transcription using vosk-transcriber
  - Support for audio formats: MP3, WAV, M4A, AAC, FLAC, OGG, WMA, OPUS
  - Support for video formats (audio extraction): MP4, AVI, MKV, MOV, WebM
  - Configurable via `ENABLE_VOSK_TRANSCRIBER` and `VOSK_MODEL_PATH` environment variables
  - Automatic transcription and ingestion into vector store
- **Video URL Support** (#18): Support for parsing YouTube and Bilibili video URLs
  - Extract audio from videos and transcribe to text
  - Ingest transcribed content into knowledge base
- **Chat History** (#27): Chat session history and session management
  - View and resume previous chat conversations
  - Session list accessible via "Session History" tab
- **Social Authentication** (#17): Integrated GitHub and Google OAuth for multi-user support
  - User authentication and authorization
  - User-specific data isolation (private notebooks and notes)
- **WebSocket Streaming** (#16): WebSocket-based real-time streaming chat output
  - Improved user experience with streaming responses
- **Multi-User Mode** (#15): Full multi-user support with data isolation
  - Private notebooks and notes per user
  - User-specific uploads and storage
- **PPT Generation** (#3): Transform content into presentation slides
  - Integration with Google Gemini 3 Pro Preview for outline generation
  - Individual image generation for each slide using Gemini 3 Pro Image Preview
  - Interactive slider UI for viewing slides
- **Infographic Generation** (#2, #13): Transform content into visual infographics
  - Integration with Google Gemini Nano Banana SDK
  - Support for `gemini-3.1-flash-image-preview` model
  - Hand-drawn/illustration style designs
  - Dedicated UI container for rendering generated infographics
- **Mindmap Generation** (#1): Generate structured visual mindmaps from sources
  - Integration with Mermaid.js for interactive diagram rendering
  - Automatic extraction of hierarchical concepts and relationships
- **Data Analysis** (#4): Data analysis capabilities with vector search and RAG
  - Query-based content retrieval with citations
  - Source-backed responses from knowledge base
- **File Rendering** (#5): Support for rendering multiple file formats
  - PDF, Markdown, TXT, DOCX, XLSX, PPTX and more
  - Integrated file preview with proper content extraction
- **Enhanced Logging**: Integrated `github.com/kataras/golog` for professional, leveled logging
- **Configuration**: Added environment variable support (GOOGLE_API_KEY, GEMINI_BASE_URL, etc.)

### Changed
- **Tab Order Adjustment**: Reorganized center panel tabs for better workflow
  - Order: Chat → Session History → Notes List → Note
- **Gemini Image Generation**: Rewrote using REST API with improvements
  - Retry mechanism with exponential backoff (up to 10 attempts)
  - Serial execution lock for image generation
  - Configurable BaseURL support
  - Configurable aspect ratio (16:9) and image size (2K)
  - Default model: `gemini-3.1-flash-image-preview`

### Fixed
- **Progress Display**: Fixed progress bar behavior for source processing
  - Show 100% progress before completion
  - Wait 2 seconds before hiding progress bar
  - Fixed polling to resume after page refresh
  - Show minimum 1% progress for pending state
  - Increased polling frequency (2s → 1s)
- **Audio Transcript Display**: Fixed audio transcript UI issues
  - Added max-height (400px) and scroll for long transcripts
  - Fixed expand/collapse button functionality
  - Removed redundant close button in resource preview tabs
- **Left Panel Source Icon**: Fixed missing "Add Source" button when panel is expanded
- **Mindmap Root Name**: Fixed extra quotes in mindmap root node labels
- **Favicon**: Fixed 404 error by embedding as data URI
- **Return to Landing Page**: Fixed page not refreshing when returning from workspace
- **Readonly Mode**: Fixed transformer disabled when switching from public to private notebook
- **Right Panel Styling** (#22): Fixed right panel display issues on low resolution
  - Notes generation records now properly displayed
  - Removed unnecessary padding for more compact display
  - Added scroll support for right panel height

### Performance
- **Optimized Loading** (#9, #11, #12): Reduced unnecessary API calls
  - Single API call to fetch notebook list with statistics
  - Caching mechanism to reduce redundant requests
  - Efficient data loading and rendering

### Deployment
- **Docker Support** (#8): Complete Docker deployment configuration
- **Binary Releases** (#7): Pre-compiled binaries for mainstream platforms
  - Linux (amd64, arm64)
  - macOS (amd64, arm64)
  - Windows (amd64)

### Documentation
- **Documentation** (#21): Enhanced documentation
  - English

### Configuration
- **Environment Variables** (#10): Frontend configuration support
  - Configurable via environment variables
  - Settings for models, APIs, storage, etc.
