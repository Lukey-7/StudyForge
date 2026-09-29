# Design decisions (and why)

Short records of each non-obvious choice: **decision → why → trade-off**.

### D1. Rewrite in Python/FastAPI instead of extending the Go code
- **Why:** Google's `google-genai` SDK, `chromadb` and `supabase-py` are first-class in Python. FastAPI gives typed request validation (Pydantic) and auto-generated API docs at `/docs`.
- **Trade-off:** Python is slower than Go for CPU work. Our bottleneck is the LLM API, not CPU.

### D2. Keep v1 in `legacy-go/` and tag `v1-go`
- **Why:** it's the version defended at the viva (Go + LangChainGo). The history stays honest and visible.

### D3. Chroma in **embedded** mode (`PersistentClient`) by default
- **Why:** no extra server to run or pay for, and it's ideal for a single backend instance. `CHROMA_MODE=http` switches to a Chroma server with no code change (`app/vector_store.py`).
- **Trade-off:** the index lives on the backend's disk, so on Cloud Run (ephemeral disk) you need a Chroma server or a mounted volume, or you rebuild the index from Postgres with `scripts/reindex.py`.

### D4. Postgres = source of truth, Chroma = search index
- **Why:** Postgres gives transactions, joins, RLS and backups. Chroma only holds vectors and filter metadata, so it can always be rebuilt from the `chunks` table (for example after changing the embedding model).
- **Trade-off:** each chunk's text is stored twice (the Chroma copy is only ids + vectors + metadata, which keeps it small).

### D5. One Chroma collection **per embedding model**
- **Why:** vectors from different models live in different spaces, and comparing them is meaningless. The collection name includes the model and dimension (`chunks__gemini-embedding-001__768`). If the embedding model changes, retrieval reads the new collection and `scripts/reindex.py` fills it.

### D6. Embedding model: `gemini-embedding-001`, as a config value
- **Why:** Google retired `text-embedding-004` in favour of `gemini-embedding-001`, which has better quality, separate `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` task types and an adjustable vector size (768/1536/3072). `EMBEDDING_MODEL` is configurable. An optional `EMBEDDING_FALLBACK_MODEL` is tried automatically if the first model is rejected (400/404). `/health` and each source's `embedding_model` column record **which model actually ran**.
- We request 768 dimensions (`output_dimensionality`) and L2-normalise the vectors, because Google says truncated `gemini-embedding-001` vectors must be normalised.

### D7. Supabase accessed with the **service-role key** from the backend; ownership checked in code; RLS as defence in depth
- **Why:** one simple client and no per-request auth plumbing. Background ingestion tasks run after the request ends, when no user token is available. Every route checks `notebook.user_id == current user` (`app/api/deps.py`) and returns 404, not 403, so ids can't be probed. RLS policies still protect the tables if anyone queries Supabase directly with a user JWT.
- **Trade-off:** a bug in an ownership check would not be caught by RLS. Tests cover the 404 case.

### D8. Supabase Auth verifies tokens (`auth.get_user`) instead of hand-written JWT code
- **Why:** fewer auth edge cases. Supabase handles signature algorithms, key rotation, expiry and revoked sessions. A verified token is cached for 60 s (keyed by its SHA-256), so most requests make no network call.
- **Trade-off:** a cold cache means one HTTP call to Supabase. It's negligible next to LLM latency.

### D9. Hand-written BM25 instead of `rank_bm25`
- **Why:** `rank_bm25.BM25Okapi` uses IDF = ln((N−n+0.5)/(n+0.5)), which is **negative** when a word appears in more than half the chunks. In a small notebook that silently dropped real matches, and our unit test caught it. We use the Lucene variant ln(1 + …), which is always positive. It is 25 readable lines (`app/retrieval/keyword.py`).

### D10. RRF written by hand; MMR relevance = fused score
- **Why RRF:** dense cosine scores and BM25 scores are on different scales, and rank fusion needs no score calibration.
- **Why MMR on the fused score:** the first version used query–chunk cosine as the MMR relevance term. That quietly threw away BM25's contribution and re-ranked by embeddings alone. The eval script exposed it. MMR now diversifies the *hybrid* ranking.

### D11. Structured JSON output + Pydantic validation + one repair retry
- **Why:** 16 renderers in the UI need predictable shapes. Gemini's `response_json_schema` constrains decoding. Pydantic validators add rules a schema can't express (a quiz `correct_index` must point at a real option). On failure we re-ask once, with the validation error in the prompt (`app/llm/json_output.py`).

### D12. Pipelines as a registry of data, not 16 classes
- **Why:** all pipelines follow the same steps: gather material → prompt → JSON → validate → cache. Only the config differs (`app/generation/registry.py`). Adding a pipeline is one `PipelineSpec` plus one schema.

### D13. Mind map rendered to Mermaid by our code
- **Why:** LLM-written Mermaid breaks on one stray quote or bracket. The model returns `{root, branches[]}` and `app/generation/mermaid.py` produces valid syntax.

### D14. Generation cache key = (notebook, pipeline, params_hash, sources_version)
- **Why:** repeat requests are free. `sources_version` is bumped atomically (a Postgres function) whenever a source is added or removed, so the cache can never serve output built from an old set of documents.

### D15. Ingestion as FastAPI `BackgroundTasks`, not Celery/Redis
- **Why:** zero extra infrastructure, and it's enough for one instance. The status column lets the UI poll.
- **Trade-off:** if the process restarts mid-ingestion, the source stays in an in-progress status. The user can hit *Retry* (`POST /sources/{id}/retry`). At scale, use a queue (Cloud Tasks or Pub/Sub).

### D16. Local demo mode (`DB_BACKEND=memory`, `AUTH_MODE=dev`)
- **Why:** you can run and demo the whole app with only a Gemini key, before Supabase is set up. The same `Repository` interface has two implementations, and the tests use the local one.
- **Trade-off:** it's single-process and writes the whole JSON file on each change. It's for demos only and is never used in production.

### D17. OpenAI as an optional *text* fallback only
- **Why:** free-tier Gemini returns 429s under load. If `OPENAI_API_KEY` is set, `FallbackLLM` retries text and JSON generation on OpenAI. Embeddings are never mixed across providers (see D5).

### D18. Token counting ≈ characters / 4
- **Why:** it's good enough for budgets that already keep a safety margin, needs no tokenizer download, and is easy to explain. It isn't exact.

### D19. Layout change vs the suggested plan
- The LLM client lives in `app/llm/` (Gemini, OpenAI, fallback router, rate limiter, JSON validation) instead of a single `generation/llm.py`, because ingestion (OCR, embeddings) and chat use it too, not only generation.
- `app/services.py` holds all long-lived dependencies, and `app/vector_store.py` wraps Chroma.
- No `docker-compose.yml`: Chroma runs embedded, so local development needs no containers. `backend/Dockerfile` exists only for the Cloud Run deploy.

### D21. pymupdf4llm for PDFs
- **Why:** a small add-on to PyMuPDF that outputs per-page **markdown** (headings as `#`, lists, tables). The chunker already understands `#` headings, so chunks follow sections. Heavier parsers (Docling etc.) were skipped: large installs, slow, and PyMuPDF + Gemini OCR covers scanned pages.

### D22. Contextual chunk headers
- **Why:** before embedding, each chunk gets `Document: <file>` + `Section: <heading>` prepended. An isolated chunk ("it has O(log n) lookups") becomes unambiguous, which is cheap and improves dense retrieval. Only the embedding input changes; stored text does not.

### D23. Long context first, map-reduce as a fallback
- **Why:** Gemini Flash accepts about 1M input tokens, so most notebooks fit in one generation call (budget 150k tokens), which means fewer steps and fewer bugs. Map-reduce (60k-token groups) only runs for very large notebooks and keeps us under free-tier tokens-per-minute limits.

### D24. Structured output straight from Pydantic
- **Why:** the `google-genai` SDK accepts the Pydantic class as `response_schema`, so there's no hand-maintained JSON schema. We still validate with Pydantic (custom validators) and repair once.

### D25. Kept ChromaDB rather than Supabase pgvector
- pgvector would remove the second store: vectors would sit next to the rows, delete cascades would be automatic, and there'd be no sync step. ChromaDB is kept because it's on the resume and the Postgres-first design makes Chroma fully rebuildable. pgvector is the first thing to change for a multi-instance deployment (also the answer to "what would you change?").

### D26. Default LLM `gemini-3.8-flash`; LLM rerank ON by default (decided by measurement)
- **Model:** all 16 pipelines + chat were run end-to-end on both `gemini-2.5-flash` and `gemini-3.8-flash` (2026-09-29). Both gave 16/16 valid outputs; 3.8 was faster (~8 s vs ~14 s average per pipeline). It stays a config value (`LLM_MODEL`), so switching back is one line.
- **Rerank:** the eval showed the LLM rerank layer gave the biggest quality jump of all layers (see `backend/eval/results.md`), so it is on by default. Cost: one extra fast LLM call per query; `RERANK_WITH_LLM=false` turns it off when quota is tight.

### D20. React without TypeScript or a UI kit
- **Why:** less to explain in an interview. Plain CSS variables carry the v1 design system over. React Query handles server state (caching, polling, refetch) and `useState` handles UI state.
