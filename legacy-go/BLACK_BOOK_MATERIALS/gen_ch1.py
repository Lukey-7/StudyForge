# Chapter 1-2 content appender
import sys
sys.path.insert(0, r"e:\notex\BLACK_BOOK_MATERIALS")
from generate_blackbook import *

# ============================================================
# CHAPTER 1: INTRODUCTION
# ============================================================
add_chapter_heading("Chapter 1: Introduction")

add_subheading("1.1 Introduction")
add_body("The rapid growth of digital educational content has fundamentally transformed how students interact with academic material. Traditional note-taking approaches, whether handwritten or digital, require learners to manually synthesise information from diverse sources into structured study material. This process is time-intensive, error-prone, and inherently limited by the individual's ability to identify, extract, and reorganise key concepts from complex documents.")
add_body("Artificial intelligence, and specifically Large Language Models (LLMs), have demonstrated remarkable capabilities in natural language understanding, summarisation, and knowledge synthesis. Systems such as Google's NotebookLM, Notion AI, and various GPT-powered assistants have introduced document-level chat and basic summarisation features. However, these tools typically operate as single-layer systems: they can answer questions about a document or generate a brief summary, but they do not provide a comprehensive, multi-stage knowledge processing pipeline that transforms raw academic content into study-optimised material across multiple formats.")
add_body("StudyForge addresses this gap by introducing a layered architecture that treats document processing as a pipeline rather than a single operation. The system ingests raw documents of various formats, extracts and chunks their textual content, stores the chunks in a searchable vector space, and then offers multiple AI-driven transformation modes — Summary, FAQ, Study Guide, and Exam Notes — each designed for a specific study context. Beyond individual document processing, StudyForge introduces Notebook-level organisation, allowing students to group related sources into named collections, and a Textbook Generation module that compiles all material within a notebook into a structured, chapter-based study document.")

add_subheading("1.2 Background")
add_body("The field of AI-assisted education has evolved through several distinct phases. Early systems focused on keyword-based search and simple document retrieval. The advent of transformer-based language models in 2017, followed by GPT-3 in 2020 and GPT-4 in 2023, introduced the capability for sophisticated text generation and comprehension. Google's release of the Gemini model family in late 2023 provided a cost-effective, high-performance alternative that could be accessed through an OpenAI-compatible API endpoint, making advanced LLM capabilities accessible to independent developers.")
add_body("Retrieval-Augmented Generation (RAG) emerged as a critical architectural pattern for building knowledge-grounded AI systems. Unlike pure generative approaches that rely solely on the model's training data, RAG systems first retrieve relevant passages from a user's document corpus and then feed those passages as context to the LLM. This approach significantly reduces hallucination, ensures factual grounding, and enables the model to generate responses that are directly traceable to specific source material.")
add_body("The open-source Notex project, originally developed as a Chinese-language document chat application, provided the foundational codebase for StudyForge. Notex implemented basic document ingestion, vector storage, and chat functionality using a Go backend with SQLite persistence. StudyForge extends this foundation by migrating the LLM provider, adding multi-mode note generation, implementing notebook-level organisation, introducing textbook compilation, and completely re-theming the frontend with a modern dark glassmorphism design system.")
add_body("The choice of Go as the backend language reflects a deliberate architectural decision. Go's compiled nature provides excellent performance for I/O-intensive operations such as document parsing and API calls, while its goroutine-based concurrency model enables efficient handling of multiple simultaneous document processing requests without the complexity of traditional thread management.")

add_subheading("1.3 Objectives")
add_body("The primary objectives of the StudyForge project are as follows:")
add_bullet("To design and implement an AI-powered document-to-study-system pipeline that transforms raw academic content into structured, multi-format study material.")
add_bullet("To migrate the LLM integration from OpenAI GPT to Google Gemini 1.5 Flash via the OpenAI-compatible API endpoint, ensuring cost-effectiveness without sacrificing output quality.")
add_bullet("To implement a multi-mode note generation engine supporting four transformation types: Summary (condensed overviews), FAQ (question-answer pairs), Study Guide (structured learning outlines), and Exam Notes (exam-focused revision material).")
add_bullet("To develop a Notebook organisational system that enables users to group related sources into named, colour-coded knowledge containers.")
add_bullet("To build a Textbook Generation module that compiles all sources and notes within a notebook into a chapter-structured academic study document.")
add_bullet("To implement a Retrieval-Augmented Generation (RAG) chat system that enables natural language querying with source-cited responses.")
add_bullet("To support multi-format document ingestion including PDF, DOCX, TXT, Markdown, HTML, and image-based files through OCR integration.")
add_bullet("To re-theme the entire frontend with a modern dark glassmorphism design system featuring the StudyForge brand identity.")

add_subheading("1.4 Purpose, Scope and Applicability")
add_sub_subheading("1.4.1 Purpose")
add_body("The purpose of StudyForge is to bridge the gap between passive document storage and active knowledge synthesis. Existing tools treat documents as static artefacts to be searched or summarised in isolation. StudyForge treats them as raw material to be processed through a multi-stage pipeline that produces structured, study-ready output in multiple formats tailored to different learning contexts.")

add_sub_subheading("1.4.2 Scope")
add_body("The scope of this project encompasses the following:")
add_bullet("Backend development in Go with SQLite persistence for all data models.")
add_bullet("Frontend development as a vanilla JavaScript Single-Page Application with CSS glassmorphism theming.")
add_bullet("Integration with Google Gemini 1.5 Flash for all LLM operations.")
add_bullet("Document processing pipeline supporting seven input formats.")
add_bullet("Four-mode note generation with configurable prompt templates.")
add_bullet("Notebook grouping with metadata (colour, icon, description).")
add_bullet("Textbook generation from notebook contents.")
add_bullet("RAG-powered chat with source citation.")
add_body("The following items are explicitly out of scope for the current semester:")
add_bullet("User authentication and multi-user support.")
add_bullet("Cloud deployment and horizontal scaling.")
add_bullet("Real-time collaborative editing.")
add_bullet("Mobile application development.")

add_sub_subheading("1.4.3 Applicability")
add_body("StudyForge is designed for individual academic use, targeting postgraduate and undergraduate students who need to process large volumes of academic literature into structured study material. The system is also applicable for researchers conducting literature reviews, educators preparing course material, and professionals processing technical documentation for training purposes.")

add_subheading("1.5 Organisation of the Report")
add_body("This report is organised into seven chapters:")
add_bullet("Chapter 1 — Introduction: Provides the project overview, background, objectives, and scope.")
add_bullet("Chapter 2 — Literature Survey: Reviews existing systems, identifies research gaps, and positions StudyForge within the current landscape.")
add_bullet("Chapter 3 — Requirements and Analysis: Defines the problem, specifies functional and non-functional requirements, describes the SDLC model, and presents the technology stack.")
add_bullet("Chapter 4 — System Design: Details the system architecture, database schema, procedural design, UI design, and API specification.")
add_bullet("Chapter 5 — Implementation and Testing: Covers coding details, frontend implementation, and comprehensive test cases.")
add_bullet("Chapter 6 — Results and Discussion: Presents module-wise results, performance evaluation, and critical discussion.")
add_bullet("Chapter 7 — Conclusions and Future Work: Summarises findings, acknowledges limitations, and outlines the Semester 2 roadmap.")

add_page_break()

# ============================================================
# CHAPTER 2: LITERATURE SURVEY
# ============================================================
add_chapter_heading("Chapter 2: Literature Survey")

add_subheading("2.1 Overview of Related Work")
add_body("The development of AI-powered knowledge management systems has accelerated significantly since 2022, driven by advances in transformer architectures and the commercial availability of large language models. This chapter reviews the existing landscape of educational AI tools, document processing systems, and knowledge synthesis platforms, identifying the specific gaps that StudyForge addresses.")
add_body("The literature review is organised into three categories: (1) commercial AI-powered note-taking and study tools, (2) open-source document processing frameworks, and (3) academic research on RAG systems and prompt engineering for educational contexts.")

add_subheading("2.2 Review of Existing Technologies")

add_sub_subheading("2.2.1 Google NotebookLM")
add_body("Google NotebookLM, released in 2023, represents the most direct commercial analogue to StudyForge. It allows users to upload documents and conduct AI-powered conversations grounded in those sources. NotebookLM generates summaries, study guides, and FAQs from uploaded material, and its latest iteration introduced 'Audio Overview' — a podcast-style audio summary feature.")
add_body("Strengths: NotebookLM excels at source-grounded responses, providing inline citations that link to specific passages in uploaded documents. Its integration with the Gemini model family provides high-quality text generation. The system supports Google Docs, PDFs, and web URLs as input sources.")
add_body("Limitations: NotebookLM operates as a closed, cloud-only platform with no self-hosting option. It lacks support for notebook-level organisation beyond individual 'notebooks' that function as isolated document containers. There is no textbook generation capability, no exam-specific note format, and no ability to customise the prompts used for content generation. The system is also limited to Google's ecosystem and does not support offline usage.")

add_sub_subheading("2.2.2 Notion AI")
add_body("Notion AI integrates generative AI capabilities into Notion's existing workspace platform. It offers inline AI assistance for writing, summarisation, translation, and content generation within the Notion document editor.")
add_body("Strengths: Notion AI benefits from deep integration with Notion's powerful database, kanban, and wiki features. Users can generate summaries, action items, and translations within their existing workflow.")
add_body("Limitations: Notion AI operates at the page level and does not provide cross-document knowledge synthesis. It cannot ingest external PDFs or academic papers for analysis. The AI features are designed as writing assistants rather than study material generators, and the system lacks RAG-style source citation.")

add_sub_subheading("2.2.3 ChatPDF and Similar Tools")
add_body("ChatPDF, PDF.ai, and similar single-document chat tools allow users to upload a PDF and ask questions about its content. These tools typically use basic text extraction followed by embedding-based retrieval to answer queries.")
add_body("Strengths: These tools provide a simple, focused user experience for interacting with individual documents. They require no setup or configuration.")
add_body("Limitations: These systems are fundamentally single-document tools. They cannot process multiple documents simultaneously, do not support cross-document querying, and offer no organisational features. Output is limited to chat responses; there is no structured note generation, study guide creation, or textbook compilation.")

add_sub_subheading("2.2.4 Quillbot and Grammarly")
add_body("Quillbot and Grammarly represent AI-powered writing assistance tools that focus on paraphrasing, grammar correction, and stylistic improvement. While not direct competitors to StudyForge, they illustrate the broader trend of AI integration into academic workflows.")
add_body("Strengths: These tools excel at sentence-level text improvement and are widely adopted in academic settings.")
add_body("Limitations: They do not perform document analysis, knowledge extraction, or study material generation. Their functionality is limited to surface-level text editing rather than deep content synthesis.")

add_sub_subheading("2.2.5 Open-Source RAG Frameworks")
add_body("Several open-source frameworks have emerged for building RAG applications, including LangChain (Python/JavaScript), LlamaIndex, and Haystack. These frameworks provide modular components for document loading, text splitting, embedding generation, vector storage, and LLM integration.")
add_body("LangChain, in particular, has become the dominant framework for RAG application development, offering pre-built connectors for dozens of vector databases, embedding models, and LLMs. The Go ecosystem offers langchaingo, a Go port of LangChain's core abstractions.")
add_body("StudyForge leverages langchaingo's schema definitions (specifically the schema.Document type) while implementing custom text splitting and similarity search algorithms optimised for academic content. This approach provides the flexibility of framework-level abstractions without the overhead of a full framework dependency.")

add_sub_subheading("2.2.6 Academic Research on RAG and Prompt Engineering")
add_body("Lewis et al. (2020) introduced the RAG paradigm in their seminal paper 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', demonstrating that combining retrieval with generation significantly improved factual accuracy and reduced hallucination in language model outputs. This work established the theoretical foundation for systems like StudyForge.")
add_body("Recent research by Gao et al. (2023) in 'Retrieval-Augmented Generation for Large Language Models: A Survey' systematically categorised RAG architectures into naive RAG, advanced RAG, and modular RAG patterns. StudyForge implements a naive RAG architecture with custom enhancements for multi-mode output generation.")
add_body("In the domain of prompt engineering, Wei et al. (2022) demonstrated the effectiveness of chain-of-thought prompting for complex reasoning tasks. StudyForge's prompt templates incorporate elements of structured prompting, including explicit output format specifications, role-based instructions, and context-aware generation directives.")

add_subheading("2.3 Identified Research Gaps")
add_body("The literature review reveals several significant gaps in existing systems:")

add_body_bold("Gap 1: Absence of Multi-Mode Note Generation")
add_body("No existing system offers multiple, purpose-specific note generation modes within a single platform. NotebookLM provides summaries and FAQs as separate features, but does not offer exam-focused notes or structured study guides with configurable output formats.")

add_body_bold("Gap 2: Lack of Hierarchical Knowledge Organisation")
add_body("Current tools treat documents as flat collections within isolated containers. There is no support for grouping related documents into notebooks with metadata, creating cross-notebook knowledge connections, or compiling notebook contents into unified study documents.")

add_body_bold("Gap 3: No Textbook Generation Capability")
add_body("No reviewed system offers the ability to compile multiple documents and generated notes into a structured, chapter-based textbook format. This capability is essential for comprehensive exam preparation and literature review synthesis.")

add_body_bold("Gap 4: Limited Self-Hosting and Customisation")
add_body("Commercial tools like NotebookLM and Notion AI offer no self-hosting option, no prompt customisation, and no ability to integrate alternative LLM providers. Academic users and institutions with data privacy requirements cannot use these platforms for sensitive research material.")

add_body_bold("Gap 5: Single-Language Limitation")
add_body("The open-source Notex project, while providing a strong technical foundation, was designed exclusively for Chinese-language users with hardcoded Chinese prompts and UI strings. No open-source alternative existed for English-language academic knowledge processing.")

add_styled_table(
    ["Feature", "NotebookLM", "Notion AI", "ChatPDF", "Quillbot", "StudyForge"],
    [
        ["Multi-format ingestion", "Partial", "No", "PDF only", "No", "Yes (7 formats)"],
        ["Multi-mode notes", "Partial", "No", "No", "No", "Yes (4 modes)"],
        ["RAG chat with citations", "Yes", "No", "Basic", "No", "Yes"],
        ["Notebook organisation", "Basic", "Yes", "No", "No", "Yes (with metadata)"],
        ["Textbook generation", "No", "No", "No", "No", "Yes"],
        ["Self-hosted / OSS", "No", "No", "No", "No", "Yes"],
        ["Custom LLM provider", "No", "No", "No", "No", "Yes"],
        ["Exam-specific notes", "No", "No", "No", "No", "Yes"],
        ["Offline capable", "No", "No", "No", "No", "Yes (local LLM)"],
    ],
    "Table 2.1: Comparative Analysis of Existing Systems"
)

add_subheading("2.4 Objectives of Thesis Work")
add_body("Based on the identified gaps, the thesis work establishes the following specific objectives:")
add_bullet("Design and implement a multi-mode note generation engine with four distinct transformation types, each governed by a purpose-specific prompt template.")
add_bullet("Develop a hierarchical Notebook organisational system with metadata support (colour, icon, description) and source-to-notebook linking.")
add_bullet("Build a Textbook Generation module that compiles notebook contents into structured chapter documents.")
add_bullet("Migrate the LLM backend from OpenAI to Google Gemini via OpenAI-compatible endpoints while maintaining architectural flexibility for future provider changes.")
add_bullet("Localise and rebrand the entire system from Chinese (Notex) to English (StudyForge), including all prompts, UI strings, and documentation.")
add_bullet("Re-theme the frontend with a dark glassmorphism design system that reflects modern educational technology aesthetics.")

add_page_break()

# Save
doc.save(OUTPUT_PATH)
print("[2/5] Chapters 1-2 appended and saved.")
