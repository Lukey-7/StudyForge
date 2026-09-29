# Chapter 5: Implementation and Testing
import sys
sys.path.insert(0, r"e:\notex\BLACK_BOOK_MATERIALS")
exec(open("gen_ch3.py", encoding="utf-8").read())

add_chapter_heading("Chapter 5: Implementation and Testing")

add_subheading("5.1 Implementation Approach")
add_body("The implementation of StudyForge followed a bottom-up approach, starting with the core backend modules and progressively building towards the frontend integration. The development process was organised into five distinct phases:")
add_bullet("Phase 1 \u2014 Foundation: Codebase audit of the Notex project, environment configuration, and LLM provider migration from OpenAI to Google Gemini.")
add_bullet("Phase 2 \u2014 Localisation: Complete English translation of all Chinese-language strings, prompts, UI labels, and comments across the entire codebase.")
add_bullet("Phase 3 \u2014 Core Features: Implementation of the multi-mode note generation engine (Summary, FAQ, Study Guide, Exam Notes) with purpose-specific prompt templates.")
add_bullet("Phase 4 \u2014 Organisation: Development of the Notebook grouping system with metadata support, source linking, and the Textbook generation module.")
add_bullet("Phase 5 \u2014 Frontend: Complete re-theming with the dark glassmorphism design system, implementation of the Stitch-inspired multi-view SPA layout.")

add_subheading("5.2 Coding Details")
add_sub_subheading("5.2.1 Configuration Module (config.go)")
add_body("The configuration module centralises all runtime parameters into a single Config struct. Environment variables are read at startup with sensible defaults, ensuring the application can run without explicit configuration in development mode.")

add_code_block("""type Config struct {
    ServerAddress      string
    SQLitePath         string
    UploadDir          string
    OpenAIKey          string
    OpenAIBaseURL      string
    OpenAIModel        string
    EmbeddingModel     string
    ChunkSize          int
    ChunkOverlap       int
    MaxTokens          int
    EnableMarkitdown   bool
    EnableVoskTranscriber bool
    VoskModelPath      string
}""", "Code Listing 5.1: Config Struct Definition (config.go)")

add_body("The NewConfig() function reads environment variables with fallback defaults. This design pattern ensures that sensitive credentials (API keys) are never hardcoded in source code, and deployment-specific parameters (server address, database path) can be customised without recompilation.")

add_sub_subheading("5.2.2 Data Models (types.go)")
add_body("The data model layer defines Go structs that map directly to SQLite tables via GORM struct tags. Each struct implements the domain entity pattern, encapsulating both data fields and validation logic.")

add_code_block("""type Source struct {
    ID           string    `json:"id" gorm:"primaryKey"`
    NotebookID   string    `json:"notebook_id"`
    Filename     string    `json:"filename"`
    OriginalName string    `json:"original_name"`
    FilePath     string    `json:"filepath"`
    FileType     string    `json:"file_type"`
    FileSize     int64     `json:"file_size"`
    Content      string    `json:"content"`
    Summary      string    `json:"summary"`
    Status       string    `json:"status" gorm:"default:'pending'"`
    CreatedAt    time.Time `json:"created_at"`
    UpdatedAt    time.Time `json:"updated_at"`
}""", "Code Listing 5.2: Source Struct Definition (types.go)")

add_code_block("""type TransformationRequest struct {
    SourceID   string `json:"source_id"`
    NotebookID string `json:"notebook_id"`
    Mode       string `json:"mode"`
    Style      string `json:"style"`
}""", "Code Listing 5.3: TransformationRequest Struct (types.go)")

add_body("The TransformationRequest struct defines the contract for the note generation API. The Mode field accepts one of four values: \"summary\", \"faq\", \"study_guide\", or \"exam_notes\". The Style field provides an optional customisation parameter that modifies the prompt template's output formatting.")

add_sub_subheading("5.2.3 Prompt Engineering System (prompt.go)")
add_body("The prompt engineering system is the intellectual core of StudyForge. Each transformation mode is implemented as a carefully crafted prompt template that instructs the Gemini model to generate output in a specific format optimised for the target study context.")

add_code_block("""func getTransformationPromptWithStyle(mode, content, style string) string {
    switch mode {
    case "summary":
        return fmt.Sprintf(`You are an expert academic summariser.
Analyse the following document content and produce a comprehensive,
well-structured summary. Organise the summary with clear headings
and subheadings. Highlight key concepts, main arguments, and
significant findings.

Style: %s

Document Content:
%s

Generate a detailed, academically rigorous summary:`, style, content)

    case "faq":
        return fmt.Sprintf(`You are an expert educator creating FAQ
study material. Analyse the following document and generate a
comprehensive set of questions and answers that cover all key
topics. Format each Q&A pair clearly.

Document Content:
%s

Generate FAQ pairs:`, content)
    // ... additional modes
    }
}""", "Code Listing 5.4: Prompt Template System (prompt.go) \u2014 Simplified")

add_body("Each prompt template follows a consistent structure: (1) Role assignment (\"You are an expert...\"), (2) Task specification with explicit output format requirements, (3) Optional style parameter injection, (4) Document content insertion, and (5) Generation trigger. This structured approach ensures consistent, high-quality output across all transformation modes.")

add_sub_subheading("5.2.4 Vector Store and Similarity Search (vector.go)")
add_body("The vector store module implements document chunking, storage, and retrieval. Text is split into overlapping chunks using a language-aware algorithm that detects CJK (Chinese, Japanese, Korean) text and switches between character-based and word-based splitting accordingly.")

add_code_block("""func (vs *VectorStore) splitText(text string, chunkSize, chunkOverlap int) []string {
    // Detect CJK content by sampling first 1000 runes
    runes := []rune(text)
    cjkCount := 0
    for i := 0; i < min(1000, len(runes)); i++ {
        if runes[i] >= 0x4E00 && runes[i] <= 0x9FFF {
            cjkCount++
        }
    }
    cjkRatio := float64(cjkCount) / float64(min(1000, len(runes)))

    if cjkRatio > 0.3 {
        // CJK: split by character count
        // ...
    } else {
        // Western: split by word boundaries
        words := strings.Fields(text)
        for i := 0; i < len(words); i += (chunkSize - chunkOverlap) {
            end := min(i + chunkSize, len(words))
            chunk := strings.Join(words[i:end], " ")
            chunks = append(chunks, chunk)
        }
    }
    return chunks
}""", "Code Listing 5.5: Language-Aware Text Chunking (vector.go)")

add_body("Similarity search uses a multi-signal scoring algorithm that combines substring matching, character-level overlap, word-level matching, and question keyword boosting. Documents are ranked by composite score and the top-k results are returned to the RAG pipeline.")

add_code_block("""func (vs *VectorStore) SimilaritySearch(ctx context.Context, 
    notebookID, query string, numDocs int) ([]schema.Document, error) {
    // Filter by notebook
    // Score using: substring match (+10), char overlap (+5*ratio),
    //   word match (+2 per word), question keyword boost (+1)
    // Sort by score descending, return top-k
    // Fallback: return most recent documents if no matches
}""", "Code Listing 5.6: Similarity Search Algorithm (vector.go) \u2014 Pseudocode")

add_subheading("5.3 Frontend Implementation")
add_body("The frontend is structured as three files within the backend/frontend/ directory:")
add_bullet("index.html \u2014 The single-page application shell containing all view containers, modals, and navigation elements.")
add_bullet("static/style.css \u2014 The complete stylesheet (4,600+ lines) implementing the dark glassmorphism design system with responsive layouts, animations, and component styles.")
add_bullet("static/app.js \u2014 The application logic handling view switching, API communication, state management, and DOM manipulation.")

add_sub_subheading("5.3.1 View Architecture")
add_body("The SPA implements a sidebar-navigation architecture with the following primary views:")
add_bullet("Dashboard: Displays summary statistics (total sources, notes, notebooks), recent activity, and a quick-upload zone.")
add_bullet("Documents/Sources: Grid or list view of all uploaded sources with status badges, file type icons, and action buttons.")
add_bullet("Source Detail: Full content display with AI-generated insights, transformation mode selector tabs, and generated notes viewer.")
add_bullet("Notebooks: Grid of notebook cards with colour coding, description, and linked source count.")
add_bullet("Chat: Split-panel interface with session history sidebar and main chat area with message bubbles and source citations.")

add_sub_subheading("5.3.2 Design System Implementation")
add_body("The CSS design system is implemented through CSS custom properties (variables) defined at the :root level, ensuring consistent theming across all components:")

add_code_block(""":root {
    --bg-primary: #09090B;
    --bg-card: rgba(24, 24, 27, 0.80);
    --border-card: 1px solid rgba(255, 255, 255, 0.06);
    --border-hover: rgba(139, 92, 246, 0.30);
    --shadow-hover: 0 0 24px rgba(139, 92, 246, 0.10);
    --accent-primary: #8B5CF6;
    --accent-hover: #7C3AED;
    --text-primary: #FAFAFA;
    --text-secondary: #A1A1AA;
    --text-muted: #52525B;
    --success: #34D399;
    --warning: #FBBF24;
    --error: #F87171;
    --radius-card: 12px;
    --radius-btn: 8px;
    --transition: all 200ms ease;
}""", "Code Listing 5.7: CSS Design Token Variables (style.css)")

add_subheading("5.4 Testing")
add_body("Testing was conducted across four categories: unit testing of individual functions, integration testing of API endpoints, system testing of end-to-end workflows, and user acceptance testing of the frontend interface.")

add_styled_table(
    ["Test ID", "Module", "Test Case", "Input", "Expected Output", "Status"],
    [
        ["TC-01", "Ingestion", "Upload PDF document", "Sample 10-page PDF", "Source created with status 'ready'", "Pass"],
        ["TC-02", "Ingestion", "Upload DOCX document", "Sample Word file", "Text extracted, chunks created", "Pass"],
        ["TC-03", "Ingestion", "Upload image file", "Scanned page JPEG", "OCR text extracted via Gemini Vision", "Pass"],
        ["TC-04", "Ingestion", "Upload TXT file", "Plain text file", "Content stored as single chunk", "Pass"],
        ["TC-05", "Ingestion", "Upload URL source", "Wikipedia article URL", "Markdown content extracted", "Pass"],
        ["TC-06", "Notes", "Generate Summary", "Source with 5000 words", "Structured summary with headings", "Pass"],
        ["TC-07", "Notes", "Generate FAQ", "Source with 5000 words", "10+ Q&A pairs generated", "Pass"],
        ["TC-08", "Notes", "Generate Study Guide", "Source with 5000 words", "Hierarchical outline with key terms", "Pass"],
        ["TC-09", "Notes", "Generate Exam Notes", "Source with 5000 words", "Revision-focused bullet points", "Pass"],
        ["TC-10", "Notebooks", "Create notebook", "Name, colour, icon", "Notebook created with metadata", "Pass"],
        ["TC-11", "Notebooks", "Link source to notebook", "Source ID + Notebook ID", "Source appears in notebook view", "Pass"],
        ["TC-12", "Textbook", "Generate textbook", "Notebook with 3 sources", "Chapter-structured Markdown", "Pass"],
        ["TC-13", "Chat", "Send query", "\"What is RAG?\"", "Grounded response with citations", "Pass"],
        ["TC-14", "Chat", "Context-aware follow-up", "\"Explain more\"", "Response uses session context", "Pass"],
        ["TC-15", "Search", "Full-text search", "\"machine learning\"", "Matching sources and notes returned", "Pass"],
        ["TC-16", "UI", "Dark theme rendering", "Load application", "All components use design tokens", "Pass"],
        ["TC-17", "UI", "Responsive layout", "Resize to 768px", "Sidebar collapses, cards stack", "Pass"],
        ["TC-18", "API", "Invalid source ID", "GET /api/sources/invalid", "404 with error message", "Pass"],
        ["TC-19", "API", "Missing required field", "POST /api/notes/generate {}", "400 with validation error", "Pass"],
        ["TC-20", "Performance", "Large document", "50-page PDF", "Ingestion < 60s, notes < 30s", "Pass"],
    ],
    "Table 5.1: Test Cases \u2014 All Modules"
)

add_page_break()
doc.save(OUTPUT_PATH)
print("[4/5] Chapter 5 appended and saved.")
