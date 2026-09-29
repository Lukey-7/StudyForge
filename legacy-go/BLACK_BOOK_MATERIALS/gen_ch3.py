# Chapters 3-4 content
import sys
sys.path.insert(0, r"e:\notex\BLACK_BOOK_MATERIALS")
# Run prior scripts to build the document
exec(open("gen_ch1.py", encoding="utf-8").read())

# ============================================================
# CHAPTER 3: REQUIREMENTS AND ANALYSIS
# ============================================================
add_chapter_heading("Chapter 3: Requirements and Analysis")

add_subheading("3.1 Problem Definition")
add_body("Despite the rapid evolution of AI-powered educational tools, a fundamental gap persists in the market: no existing system provides a comprehensive, multi-stage pipeline for transforming raw academic documents into structured, multi-format study material with hierarchical organisation and knowledge compilation capabilities.")
add_body("Students and researchers currently rely on a fragmented toolchain comprising separate applications for document storage (Google Drive, Dropbox), note-taking (Notion, OneNote), AI chat (ChatGPT, NotebookLM), and study material creation (manual effort). This fragmentation creates cognitive overhead, forces context-switching between applications, and results in knowledge silos where related information remains disconnected across platforms.")
add_body("The core problem can be formally stated as follows: Given a corpus of heterogeneous academic documents (PDFs, lecture slides, textbooks, research papers, handwritten notes), design and implement an integrated system that (1) ingests and extracts textual content from all supported formats, (2) generates purpose-specific study material in multiple formats, (3) organises content hierarchically into notebooks, (4) compiles notebook contents into unified study documents, and (5) enables natural language querying with source-grounded responses.")

add_subheading("3.2 Requirements Specification")
add_sub_subheading("3.2.1 Functional Requirements")

add_styled_table(
    ["ID", "Module", "Requirement", "Priority"],
    [
        ["FR-01", "Document Ingestion", "System shall accept PDF, DOCX, TXT, MD, HTML, and image files", "High"],
        ["FR-02", "Document Ingestion", "System shall extract text from uploaded documents using appropriate parsers", "High"],
        ["FR-03", "Document Ingestion", "System shall perform OCR on image-based documents using Gemini Vision", "Medium"],
        ["FR-04", "Document Ingestion", "System shall support URL-based content ingestion from web pages and YouTube", "Medium"],
        ["FR-05", "Note Generation", "System shall generate Summary notes from source documents", "High"],
        ["FR-06", "Note Generation", "System shall generate FAQ (question-answer pairs) from source documents", "High"],
        ["FR-07", "Note Generation", "System shall generate structured Study Guide notes", "High"],
        ["FR-08", "Note Generation", "System shall generate Exam Notes with revision-focused content", "High"],
        ["FR-09", "Notebooks", "System shall allow creation of named notebooks with colour and icon metadata", "High"],
        ["FR-10", "Notebooks", "System shall support linking multiple sources to a notebook", "High"],
        ["FR-11", "Textbook", "System shall compile notebook sources into a chapter-structured textbook", "Medium"],
        ["FR-12", "Chat/RAG", "System shall support natural language querying over uploaded sources", "High"],
        ["FR-13", "Chat/RAG", "System shall provide source citations in chat responses", "High"],
        ["FR-14", "Chat/RAG", "System shall maintain chat session history", "Medium"],
        ["FR-15", "Search", "System shall support full-text search across all sources and notes", "Medium"],
        ["FR-16", "UI", "System shall display a dashboard with summary statistics", "Low"],
    ],
    "Table 3.1: Functional Requirements"
)

add_sub_subheading("3.2.2 Non-Functional Requirements")
add_styled_table(
    ["ID", "Category", "Requirement"],
    [
        ["NFR-01", "Performance", "Note generation shall complete within 30 seconds for documents up to 50 pages"],
        ["NFR-02", "Performance", "Search queries shall return results within 2 seconds"],
        ["NFR-03", "Performance", "Document upload and ingestion shall complete within 60 seconds"],
        ["NFR-04", "Usability", "The UI shall follow the dark glassmorphism design system specification"],
        ["NFR-05", "Usability", "The application shall be usable as a single-page application without page reloads"],
        ["NFR-06", "Reliability", "The system shall persist all data in SQLite and recover gracefully from crashes"],
        ["NFR-07", "Portability", "The application shall run on Windows, macOS, and Linux without modification"],
        ["NFR-08", "Maintainability", "The Go backend shall follow standard project layout conventions"],
        ["NFR-09", "Security", "API keys shall be stored as environment variables, never in source code"],
        ["NFR-10", "Scalability", "The architecture shall support future migration to cloud-hosted vector databases"],
    ],
    "Table 3.2: Non-Functional Requirements"
)

add_subheading("3.3 Project SDLC Model")
add_body("StudyForge follows an Agile Incremental development methodology. The project is divided into two primary semesters, with each semester delivering a functional increment of the system. Within each semester, development proceeds in weekly sprints with defined deliverables.")
add_body("The Agile approach was selected for several reasons:")
add_bullet("Rapid Prototyping: The availability of the Notex codebase as a foundation enabled immediate functional prototyping, which aligns with Agile's emphasis on working software.")
add_bullet("Iterative Refinement: The multi-mode note generation system required iterative prompt engineering cycles, where each mode's prompt template was refined based on output quality assessment.")
add_bullet("Changing Requirements: The design system underwent multiple revisions as the Stitch design reference was developed and refined.")
add_bullet("Risk Mitigation: The LLM migration (OpenAI to Gemini) carried technical risk that was best addressed through early prototyping and incremental validation.")

add_subheading("3.4 Planning and Scheduling")
add_figure_placeholder("Gantt Chart \u2014 Project Timeline showing sprint-wise deliverables across Semester 1 and Semester 2", "3.5")

add_body("The project timeline is divided as follows:")
add_body_bold("Semester 1 (Current):")
add_bullet("Weeks 1-2: Codebase audit, environment setup, Gemini API integration")
add_bullet("Weeks 3-4: English localisation, branding, frontend re-theming")
add_bullet("Weeks 5-6: Multi-mode note generation engine implementation")
add_bullet("Weeks 7-8: Notebook grouping and metadata system")
add_bullet("Weeks 9-10: Textbook generation module")
add_bullet("Weeks 11-12: Testing, documentation, project report")

add_body_bold("Semester 2 (Planned):")
add_bullet("User authentication and multi-user support")
add_bullet("Cloud deployment with Docker containerisation")
add_bullet("Advanced RAG with vector embeddings and re-ranking")
add_bullet("Spaced repetition flashcard generation")
add_bullet("Export to PDF and DOCX formats")

add_subheading("3.5 Software and Hardware Requirements")
add_styled_table(
    ["Category", "Specification"],
    [
        ["Operating System", "Windows 10/11, macOS 12+, or Ubuntu 20.04+"],
        ["Go Version", "Go 1.21 or higher"],
        ["Node.js", "Node.js 18+ (for frontend dev server)"],
        ["Python", "Python 3.10+ (for markitdown document conversion)"],
        ["Database", "SQLite 3.35+ (embedded, no separate installation required)"],
        ["Browser", "Chrome 90+, Firefox 88+, Safari 15+, Edge 90+"],
        ["API Key", "Google Gemini API key (free tier sufficient for development)"],
    ],
    "Table 3.3: Software Requirements"
)

add_styled_table(
    ["Component", "Minimum", "Recommended"],
    [
        ["Processor", "Intel i5 / AMD Ryzen 5", "Intel i7 / AMD Ryzen 7"],
        ["RAM", "4 GB", "8 GB"],
        ["Storage", "500 MB free space", "2 GB free space"],
        ["Network", "Broadband internet (for API calls)", "High-speed broadband"],
        ["Display", "1280 x 720", "1920 x 1080"],
    ],
    "Table 3.4: Hardware Requirements"
)

add_subheading("3.6 Technology Stack")
add_body("The technology stack was selected to balance development velocity, runtime performance, and long-term maintainability. Each technology choice is justified below.")

add_styled_table(
    ["Layer", "Technology", "Version", "Purpose"],
    [
        ["Backend Language", "Go", "1.21+", "HTTP server, API handlers, business logic"],
        ["Web Framework", "Iris", "12.2", "HTTP routing, middleware, static file serving"],
        ["Database", "SQLite", "3.35+", "Persistent storage for all entities"],
        ["ORM", "GORM", "2.0", "Database abstraction and migration"],
        ["LLM Provider", "Google Gemini", "1.5 Flash", "Text generation and embeddings"],
        ["LLM SDK", "go-openai", "1.20+", "OpenAI-compatible API client for Gemini"],
        ["Document Processing", "Markitdown", "0.1+", "PDF/DOCX/PPTX to Markdown conversion"],
        ["OCR", "Gemini Vision", "1.5", "Image-based text extraction"],
        ["Vector Schema", "langchaingo", "0.1+", "Document schema for RAG pipeline"],
        ["Frontend", "Vanilla JS/HTML/CSS", "ES6+", "Single-page application"],
        ["Build Tool", "Vite", "5.0+", "Frontend development server and bundler"],
        ["Audio Transcription", "Vosk", "0.3+", "Offline speech-to-text for audio files"],
    ],
    "Table 3.5: Technology Stack Overview"
)

add_sub_subheading("3.6.1 Backend: Go Programming Language")
add_body("Go (Golang) was selected as the backend language for several compelling reasons. First, Go compiles to a single static binary, eliminating dependency management issues during deployment. Second, Go's goroutine-based concurrency model enables efficient handling of multiple simultaneous document processing requests without the complexity of thread management. Third, Go's standard library provides robust HTTP server capabilities, reducing the need for heavy framework dependencies.")
add_body("The Go backend implements a monolithic architecture where all modules \u2014 document ingestion, note generation, chat, search, and textbook compilation \u2014 run within a single process. This design simplifies deployment and reduces operational complexity while maintaining clear module boundaries through package-level separation.")

add_sub_subheading("3.6.2 Database: SQLite")
add_body("SQLite was chosen as the persistence layer for its zero-configuration, serverless, and self-contained characteristics. Unlike PostgreSQL or MySQL, SQLite requires no separate database server process, making the application trivially deployable on any platform. The entire database is stored as a single file (data/studyforge.db), simplifying backup and migration.")
add_body("GORM (Go Object-Relational Mapping) provides the abstraction layer between Go structs and SQLite tables. GORM handles schema migration, query building, and relationship management through struct tags and method chaining, significantly reducing boilerplate SQL code.")

add_sub_subheading("3.6.3 LLM: Google Gemini 1.5 Flash")
add_body("Google Gemini 1.5 Flash was selected as the primary LLM for its combination of performance, cost-effectiveness, and API compatibility. Gemini 1.5 Flash offers a context window of up to 1 million tokens, enabling the processing of large academic documents without truncation. The model is accessed through Google's OpenAI-compatible API endpoint (https://generativelanguage.googleapis.com/v1beta/openai), allowing the existing go-openai SDK to be used without modification.")
add_body("The configuration is managed through environment variables:")

add_code_block("""OPENAI_API_KEY     = <Gemini API Key>
OPENAI_BASE_URL    = https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL       = gemini-1.5-flash
EMBEDDING_MODEL    = text-embedding-004""", "Code Listing 3.1: LLM Configuration Environment Variables")

add_sub_subheading("3.6.4 Frontend: Vanilla JavaScript SPA")
add_body("The frontend is implemented as a vanilla JavaScript Single-Page Application without framework dependencies (no React, Vue, or Angular). This decision was driven by the principle of simplicity: the application's UI complexity does not justify the overhead of a virtual DOM framework, and the vanilla approach provides maximum control over rendering performance and bundle size.")
add_body("The SPA architecture uses a view-toggling pattern where all views exist in the DOM simultaneously, with JavaScript controlling visibility through CSS class manipulation. Navigation is managed through programmatic state changes rather than URL-based routing, ensuring zero-reload transitions between views.")

add_subheading("3.7 Conceptual Models")

add_sub_subheading("3.7.1 Use Case Diagram")
add_figure_placeholder("Use Case Diagram showing the Student actor interacting with Upload Document, Generate Notes (with four sub-modes), Create Notebook, Generate Textbook, Chat with Sources, and Search Knowledge Base use cases", "3.1")
add_body("The Use Case Diagram identifies the Student as the primary actor and defines eight core use cases. The Generate Notes use case includes four sub-use-cases (Summary, FAQ, Study Guide, Exam Notes) connected via \u00ABinclude\u00BB relationships. The Upload Document use case extends to OCR Processing for image-based inputs.")

add_sub_subheading("3.7.2 Data Flow Diagram \u2014 Level 0")
add_figure_placeholder("Data Flow Diagram Level 0 (Context Diagram) showing the Student external entity, the StudyForge system as a single process, and data flows for Documents, Queries, Notes, Textbooks, and Chat Responses", "3.2")
add_body("The Level 0 DFD establishes StudyForge as a single system boundary receiving Documents and Queries from the Student and producing Notes, Textbooks, and Chat Responses as outputs.")

add_sub_subheading("3.7.3 Data Flow Diagram \u2014 Level 1")
add_figure_placeholder("Data Flow Diagram Level 1 decomposing the system into Document Ingestion, Text Chunking, Note Generation, Notebook Management, Textbook Compilation, Similarity Search, and Chat Response Generation processes with data stores for Sources, Chunks, Notes, Notebooks, and Textbooks", "3.3")
add_body("The Level 1 DFD decomposes the system into seven processes connected by six data stores. The Document Ingestion process receives raw files, extracts text, and passes chunks to the Text Chunking process. The Note Generation process receives source content and produces formatted notes stored in the Notes data store. The Chat Response Generation process combines the user query with retrieved chunks from Similarity Search before invoking the LLM.")

add_sub_subheading("3.7.4 Entity-Relationship Diagram")
add_figure_placeholder("Entity-Relationship Diagram showing Sources, Notes, Notebooks, Textbooks, ChatSessions, and ChatMessages entities with their relationships and cardinalities", "3.4")
add_body("The ER Diagram defines the six core entities and their relationships. A Source belongs to one Notebook (many-to-one). A Note is generated from one Source (many-to-one). A Textbook is generated from one Notebook (one-to-one). ChatMessages belong to a ChatSession (many-to-one), and each ChatSession is associated with one Notebook.")

add_page_break()

# ============================================================
# CHAPTER 4: SYSTEM DESIGN
# ============================================================
add_chapter_heading("Chapter 4: System Design")

add_subheading("4.1 System Architecture")
add_body("StudyForge employs a monolithic server architecture where the Go backend serves both the API endpoints and the static frontend assets. This design eliminates the need for separate deployment of frontend and backend services, reduces network latency between client and server, and simplifies the development workflow.")

add_figure_placeholder("System Architecture Diagram showing the three-tier architecture: Browser (SPA Frontend) communicating via HTTP/JSON with the Go Backend (Iris Router -> Handler Layer -> Service Layer -> Data Access Layer) which interfaces with SQLite, Gemini API, and the File System", "4.1")

add_body("The architecture consists of three primary tiers:")
add_bullet("Presentation Tier: A vanilla JavaScript SPA served as static files by the Go backend. All UI logic, view management, and API communication reside in a single app.js file.")
add_bullet("Application Tier: The Go backend implements the business logic organised into handler functions (HTTP request/response), service functions (business logic and LLM integration), and data access functions (GORM-based database operations).")
add_bullet("Data Tier: SQLite stores all persistent data including sources, notes, notebooks, textbooks, chat sessions, and chat messages. The vector store maintains an in-memory document index for similarity search.")

add_sub_subheading("4.1.1 Component Interaction")
add_figure_placeholder("Component Interaction Diagram showing the flow between Router, Source Handler, Note Handler, Notebook Handler, Chat Handler, Search Handler, VectorStore, LLM Client, and Database components", "4.2")

add_body("The component interaction follows a layered pattern. HTTP requests arrive at the Iris Router, which dispatches them to the appropriate Handler based on URL pattern matching. Handlers validate request parameters, invoke Service-layer functions, and format HTTP responses. Service functions orchestrate the business logic, calling the LLM Client for text generation, the VectorStore for similarity search, and GORM for database operations.")

add_subheading("4.2 Database Design")
add_body("The database schema consists of six primary tables, each mapped to a Go struct via GORM's struct-tag-based ORM.")

add_sub_subheading("4.2.1 Sources Table")
add_styled_table(
    ["Column", "Type", "Constraints", "Description"],
    [
        ["id", "TEXT", "PRIMARY KEY", "UUID, uniquely identifies each source"],
        ["notebook_id", "TEXT", "FOREIGN KEY", "References the parent notebook"],
        ["filename", "TEXT", "NOT NULL", "Original filename of the uploaded document"],
        ["original_name", "TEXT", "", "Display name for the source"],
        ["filepath", "TEXT", "", "Server-side file path"],
        ["file_type", "TEXT", "", "MIME type or extension"],
        ["file_size", "INTEGER", "", "Size in bytes"],
        ["content", "TEXT", "", "Extracted text content"],
        ["summary", "TEXT", "", "AI-generated summary"],
        ["status", "TEXT", "DEFAULT 'pending'", "Processing status (pending, processing, ready, error)"],
        ["created_at", "DATETIME", "NOT NULL", "Record creation timestamp"],
        ["updated_at", "DATETIME", "", "Last modification timestamp"],
    ],
    "Table 4.1: Sources Table Schema"
)

add_sub_subheading("4.2.2 Notes Table")
add_styled_table(
    ["Column", "Type", "Constraints", "Description"],
    [
        ["id", "TEXT", "PRIMARY KEY", "UUID for the note"],
        ["source_id", "TEXT", "FOREIGN KEY", "References the parent source"],
        ["notebook_id", "TEXT", "FOREIGN KEY", "References the parent notebook"],
        ["title", "TEXT", "NOT NULL", "Note title"],
        ["content", "TEXT", "", "Generated note content (Markdown)"],
        ["note_type", "TEXT", "", "Transformation type: summary, faq, study_guide, exam_notes"],
        ["style", "TEXT", "", "Generation style parameter"],
        ["created_at", "DATETIME", "NOT NULL", "Creation timestamp"],
        ["updated_at", "DATETIME", "", "Last update timestamp"],
    ],
    "Table 4.2: Notes Table Schema"
)

add_sub_subheading("4.2.3 Notebooks Table")
add_styled_table(
    ["Column", "Type", "Constraints", "Description"],
    [
        ["id", "TEXT", "PRIMARY KEY", "UUID for the notebook"],
        ["name", "TEXT", "NOT NULL", "Display name"],
        ["description", "TEXT", "", "User-provided description"],
        ["color", "TEXT", "DEFAULT '#8B5CF6'", "Hex colour code for UI display"],
        ["icon", "TEXT", "DEFAULT 'book'", "Icon identifier"],
        ["is_public", "BOOLEAN", "DEFAULT false", "Visibility flag"],
        ["source_ids", "TEXT", "", "JSON array of linked source IDs"],
        ["created_at", "DATETIME", "NOT NULL", "Creation timestamp"],
        ["updated_at", "DATETIME", "", "Last update timestamp"],
    ],
    "Table 4.3: Notebooks Table Schema"
)

add_sub_subheading("4.2.4 Textbooks Table")
add_styled_table(
    ["Column", "Type", "Constraints", "Description"],
    [
        ["id", "TEXT", "PRIMARY KEY", "UUID for the textbook"],
        ["notebook_id", "TEXT", "FOREIGN KEY, UNIQUE", "One-to-one with notebook"],
        ["title", "TEXT", "NOT NULL", "Textbook title"],
        ["content", "TEXT", "", "Compiled Markdown content"],
        ["status", "TEXT", "DEFAULT 'pending'", "Generation status"],
        ["created_at", "DATETIME", "NOT NULL", "Creation timestamp"],
        ["updated_at", "DATETIME", "", "Last update timestamp"],
    ],
    "Table 4.6: Textbooks Table Schema"
)

add_sub_subheading("4.2.5 Chat Sessions and Messages")
add_styled_table(
    ["Column", "Type", "Constraints", "Description"],
    [
        ["id", "TEXT", "PRIMARY KEY", "UUID for the session"],
        ["notebook_id", "TEXT", "FOREIGN KEY", "References the notebook context"],
        ["title", "TEXT", "", "Auto-generated or user-defined session title"],
        ["created_at", "DATETIME", "NOT NULL", "Creation timestamp"],
    ],
    "Table 4.5a: Chat Sessions Schema"
)

add_styled_table(
    ["Column", "Type", "Constraints", "Description"],
    [
        ["id", "TEXT", "PRIMARY KEY", "UUID for the message"],
        ["session_id", "TEXT", "FOREIGN KEY", "References the chat session"],
        ["role", "TEXT", "NOT NULL", "Message role: user or assistant"],
        ["content", "TEXT", "NOT NULL", "Message text content"],
        ["sources", "TEXT", "", "JSON array of cited source references"],
        ["created_at", "DATETIME", "NOT NULL", "Creation timestamp"],
    ],
    "Table 4.5b: Chat Messages Schema"
)

add_subheading("4.3 Procedural Design")
add_sub_subheading("4.3.1 Document Upload and Processing Sequence")
add_figure_placeholder("Sequence Diagram showing: User -> Frontend -> POST /api/sources/upload -> Backend Handler -> File System (save file) -> VectorStore.ExtractDocument() -> VectorStore.IngestText() -> splitText() -> Database (GORM save) -> Response to Frontend", "4.3")
add_body("The document upload sequence proceeds as follows: (1) The user selects a file via the frontend upload interface. (2) The frontend sends a multipart POST request to /api/sources/upload. (3) The handler saves the file to the server's uploads directory. (4) The VectorStore.ExtractDocument function determines the appropriate extraction method based on file extension. (5) For PDFs and DOCX files, markitdown converts the document to Markdown. For images, Gemini Vision performs OCR. For text files, direct reading is performed. (6) The extracted text is split into chunks using the splitText function with configurable chunk size and overlap. (7) Chunks are stored in the in-memory vector store with notebook and source metadata. (8) The source record is persisted to SQLite via GORM.")

add_sub_subheading("4.3.2 Note Generation Sequence")
add_figure_placeholder("Sequence Diagram showing: User -> Frontend -> POST /api/notes/generate -> Backend Handler -> getTransformationPromptWithStyle(mode, content) -> Prompt Template Selection -> LLM Client -> Gemini API -> Response parsing -> Database save -> Frontend display", "4.4")
add_body("The note generation sequence follows a template-driven approach: (1) The user selects a source and a transformation mode (summary, faq, study_guide, or exam_notes). (2) The frontend sends a POST request with the source ID, mode, and optional style parameter. (3) The handler retrieves the source content from the database. (4) The getTransformationPromptWithStyle function selects the appropriate prompt template based on the mode parameter. (5) The prompt template is populated with the source content and sent to the Gemini API via the OpenAI-compatible client. (6) The generated note is parsed, formatted as Markdown, and stored in the Notes table. (7) The response is returned to the frontend for display.")

add_sub_subheading("4.3.3 RAG Chat Sequence")
add_figure_placeholder("Sequence Diagram showing: User -> Frontend -> POST /api/chat -> Backend Handler -> VectorStore.SimilaritySearch(query) -> Retrieve relevant chunks -> Build RAG prompt (system + context + query) -> LLM Client -> Gemini API -> Parse response with citations -> Database save -> Frontend display", "4.5")
add_body("The RAG chat sequence implements a retrieve-then-generate pattern: (1) The user enters a natural language query in the chat interface. (2) The frontend sends the query to the chat endpoint with the notebook context. (3) The VectorStore.SimilaritySearch function performs keyword and substring matching against all chunks belonging to the specified notebook. (4) The top-k most relevant chunks are retrieved and concatenated into a context block. (5) A RAG prompt is constructed with a system instruction, the retrieved context, and the user query. (6) The prompt is sent to Gemini, and the response is parsed for source citations. (7) The chat message pair (user query and assistant response) is persisted to the database.")

add_subheading("4.4 User Interface Design")
add_body("The StudyForge frontend implements a dark glassmorphism design system with the following key characteristics:")
add_bullet("Background: #09090B (near-black) with radial gradient accents")
add_bullet("Card surfaces: rgba(24, 24, 27, 0.80) with backdrop-filter: blur(16px)")
add_bullet("Card borders: 1px solid rgba(255, 255, 255, 0.06)")
add_bullet("Accent colour: #8B5CF6 (violet-500)")
add_bullet("Typography: Inter (sans-serif) and JetBrains Mono (monospace)")
add_bullet("Border radius: 12px for cards, 8px for buttons")
add_bullet("Transitions: all 200ms ease for smooth interactions")

add_figure_placeholder("Screenshot of the Dashboard view showing stats cards (Total Sources, Total Notes, Total Notebooks), recent activity feed, and the upload zone", "5.1")
add_figure_placeholder("Screenshot of the Sources List view showing source cards with file type icons, status badges, and action buttons", "5.2")
add_figure_placeholder("Screenshot of the Chat Interface with sidebar conversation list and main chat area", "5.6")
add_figure_placeholder("Screenshot of the Dark Glassmorphism Theme showing the overall visual design language", "5.8")

add_subheading("4.5 API Design")
add_body("The StudyForge API follows RESTful conventions with JSON request/response bodies. All endpoints are prefixed with /api/.")

add_styled_table(
    ["Method", "Endpoint", "Description"],
    [
        ["GET", "/api/sources", "List all sources, optionally filtered by notebook_id"],
        ["POST", "/api/sources/upload", "Upload a new document (multipart/form-data)"],
        ["POST", "/api/sources/upload-url", "Ingest content from a URL"],
        ["GET", "/api/sources/:id", "Get source details"],
        ["DELETE", "/api/sources/:id", "Delete a source"],
    ],
    "Table 4.7: API Endpoints \u2014 Sources Module"
)

add_styled_table(
    ["Method", "Endpoint", "Description"],
    [
        ["GET", "/api/notes", "List notes for a source or notebook"],
        ["POST", "/api/notes/generate", "Generate a note with specified transformation mode"],
        ["GET", "/api/notes/:id", "Get note details"],
        ["DELETE", "/api/notes/:id", "Delete a note"],
    ],
    "Table 4.8: API Endpoints \u2014 Notes Module"
)

add_styled_table(
    ["Method", "Endpoint", "Description"],
    [
        ["GET", "/api/notebooks", "List all notebooks"],
        ["POST", "/api/notebooks", "Create a new notebook"],
        ["GET", "/api/notebooks/:id", "Get notebook details with linked sources"],
        ["PUT", "/api/notebooks/:id", "Update notebook metadata"],
        ["DELETE", "/api/notebooks/:id", "Delete a notebook"],
    ],
    "Table 4.9: API Endpoints \u2014 Notebooks Module"
)

add_styled_table(
    ["Method", "Endpoint", "Description"],
    [
        ["POST", "/api/chat", "Send a chat message and receive AI response"],
        ["GET", "/api/chat/sessions", "List chat sessions for a notebook"],
        ["GET", "/api/chat/sessions/:id", "Get chat session messages"],
        ["DELETE", "/api/chat/sessions/:id", "Delete a chat session"],
        ["GET", "/api/search", "Full-text search across sources and notes"],
        ["POST", "/api/textbooks/generate", "Generate textbook from notebook contents"],
        ["GET", "/api/textbooks/:notebook_id", "Get textbook for a notebook"],
    ],
    "Table 4.10: API Endpoints \u2014 Chat, Search, and Textbook Modules"
)

add_page_break()

doc.save(OUTPUT_PATH)
print("[3/5] Chapters 3-4 appended and saved.")
