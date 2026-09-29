# v1 audit: what the Go version actually did

v1 is preserved in [`legacy-go/`](../legacy-go) and at git tag **`v1-go`**. This is the version presented at the M.Sc. viva.

## Stack

| Layer | v1 |
|---|---|
| Backend | Go 1.25, Gin HTTP router, LangChainGo (`tmc/langchaingo` v0.1.14) for prompt templates + LLM calls |
| LLM | Gemini through its OpenAI-compatible endpoint (`OPENAI_BASE_URL=.../v1beta/openai`) |
| Storage | SQLite (`modernc.org/sqlite`) for users, notebooks, sources, notes, chat |
| Vector store | **None.** Chunks were held in an in-memory Go slice (`VectorStore.docs []schema.Document`) |
| Frontend | Vanilla JS (`app.js`, 5,640 lines) + CSS (5,808 lines), served by Go |
| Extraction | `markitdown` CLI for PDF/DOCX/PPTX, `vosk-transcriber` CLI for audio |

## How v1 retrieval actually worked (the honest 10-line version)

1. Text was split by **word count**, not tokens: 1,000 words per chunk with a 200-word overlap (`splitText`, `vector.go:116`). Mostly-CJK text was split by characters instead.
2. Chunks were appended to an **in-memory slice**, so the "index" was lost on every restart.
3. `EMBEDDING_MODEL=text-embedding-004` was read in `config.go:117` but **never called**. No vectors were computed.
4. `SimilaritySearch` (`vector.go:189`) first filtered chunks by `notebook_id`, then scored each one by hand:
5. +10 if the whole lower-cased query appeared as a substring of the chunk,
6. +5 × (fraction of the query's *characters* that appear anywhere in the chunk). This is a very weak signal, because almost every chunk contains most letters.
7. +2 for each query word longer than 2 characters found as a substring,
8. +1 for every chunk if the query contained a word like "what", "explain" or "about".
9. Scores were sorted with an O(n²) bubble-style sort and the top `MAX_SOURCES` (5) chunks were returned. If nothing scored above 0, the 5 most recent chunks were returned instead.
10. So v1 retrieval was **lexical keyword/character matching**. It had no semantic search, no ranking model and no vector DB.

For generation (`GenerateTransformation`, `agent.go:86`), v1 did **not** use retrieval at all. It pasted each source's full text, truncated to `MAX_CONTEXT_LENGTH` characters, into one prompt.

## What v1 did well (and what v2 reused)

| Reused in v2 | From |
|---|---|
| The study-output catalogue (summary, FAQ, study guide, outline, podcast, timeline, glossary, quiz, mind map, exam notes, textbook) | `legacy-go/backend/prompt.go` |
| The "exam notes" compression rules (one-line bullets, bold key terms, end with 5 exam questions) | `examNotesPrompt()`, now the `exam_notes` pipeline |
| The chat rules: answer only from the materials, cite sources, admit when the answer is missing | `chatSystemPrompt()`, rewritten as `app/chat/rag_chat.py` with `[S#]` labels |
| The mind-map idea (Mermaid `mindmap`) | `mindmapPrompt()`. v2 asks for JSON and renders Mermaid in code, so the output can't break |
| The table design: notebooks → sources → notes/chat sessions → messages, `ON DELETE CASCADE` | `legacy-go/backend/store.go`, redone in Postgres with UUIDs, indexes and RLS |
| The dark glassmorphism design system (tokens, Inter/JetBrains Mono, violet accent) | `legacy-go/backend/frontend/DESIGN.md`, ported to `frontend/src/styles/tokens.css` |

## v1 weaknesses that v2 fixes

| v1 problem | v2 fix |
|---|---|
| No embeddings, so "car" never matched "automobile" | Gemini embeddings + ChromaDB dense search |
| Character-overlap scoring is noisy | BM25 with IDF + length normalisation |
| Index lost on restart | Chroma persists to disk; Postgres keeps the chunk text, so the index can be rebuilt |
| Generation truncated long documents | Map-reduce over all chunks |
| Free-text LLM output parsed with regex | Structured JSON output validated by Pydantic, with one repair retry |
| No page numbers in answers | Page + section metadata on every chunk; `[S#]` citations with page |
| Same file uploaded twice → duplicate chunks | SHA-256 content hash + deterministic chunk ids |
| No tests for retrieval | pytest suite + retrieval eval (Recall@k, MRR) |
