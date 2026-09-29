# StudyForge v2: study guide & interview prep

This document teaches you the whole system, one part at a time. Each part covers what it does, how it works, why it was built this way, the trade-offs, **5 likely interview questions with model answers**, and **3 questions to answer yourself** (answers are at the very end, so try first).

Contents
0. [The 60-second picture](#0-the-60-second-picture)
1. [v1 → v2: the honest story](#1-v1--v2-the-honest-story)
2. [Backend skeleton & database (DBMS answer)](#2-backend-skeleton--database)
3. [Ingestion: upload → chunks → vectors](#3-ingestion)
4. [Multi-layer retrieval (the bullet they will drill)](#4-multi-layer-retrieval)
5. [RAG chat with citations](#5-rag-chat-with-citations)
6. [The 16 generation pipelines](#6-the-16-generation-pipelines)
7. [React frontend](#7-react-frontend)
8. [Shipping: tests, CI, Docker, deploy](#8-shipping)
9. [Resume → code map (every claim, where it lives)](#9-resume--code-map)
10. [Viva in 5 minutes (script)](#10-viva-in-5-minutes)
11. [The 15 hardest questions](#11-the-15-hardest-questions)
12. [Answers to the self-check questions](#12-answers-to-self-check-questions)

Jargon is defined the first time it appears, in *italics*.

---

## 0. The 60-second picture

```
Browser (React)
  │ login ─────────────► Supabase Auth ──► gives the browser a signed JWT
  │ REST + SSE (Bearer JWT)
  ▼
FastAPI backend
  ├─ upload ─► Supabase Storage (original file)
  │           └─ background task: extract text → chunk → embed ─► Postgres (chunk text) + Chroma (vectors)
  ├─ search/chat ─► 6-layer retriever ─► Gemini 3.8 Flash (streamed answer with [S1] citations)
  └─ generate ─► pipeline registry (16) ─► Gemini JSON output ─► validate ─► cache in Postgres
```

- *RAG (Retrieval-Augmented Generation)*: before asking the LLM, **retrieve** the most relevant pieces of the user's documents and put them in the prompt, so the answer is grounded in those documents instead of the model's memory.
- *Embedding*: a list of numbers (here 768 of them) that represents a text's meaning. Texts with similar meaning get vectors that point in similar directions.
- *Vector database* (ChromaDB): stores embeddings and quickly finds the nearest ones to a query vector.

---

## 1. v1 → v2: the honest story

**What to say:** "v1, the version I defended at my viva, was a Go backend using LangChainGo and SQLite. Its retrieval was keyword and character matching over chunks held in memory. The embedding model was configured but never called. For v2 I rewrote it as React + FastAPI + ChromaDB + Supabase, with real Gemini embeddings, hybrid retrieval, 16 structured pipelines and a retrieval evaluation. v1 is preserved at tag `v1-go` and in `legacy-go/`."

Why this matters: an interviewer who opens `legacy-go/backend/vector.go` will see keyword scoring. Say it first, calmly, then describe the fix. Being open about the rewrite builds trust; being caught hiding it destroys trust.

Full detail: [`V1_AUDIT.md`](V1_AUDIT.md).

**Self-check:** (1a) What did v1's `SimilaritySearch` add +5 × for? (1b) Where does LangChainGo live in the repo now? (1c) Which v1 prompts were reused in v2?

---

## 2. Backend skeleton & database

### How it works
- `backend/app/main.py`: `create_app()` builds the FastAPI app, adds CORS (*CORS*: the browser rule that decides which websites may call your API) and mounts the routers in `app/api/`. Run it with `uvicorn app.main:create_app --factory`.
- `backend/app/config.py`: every setting in one typed class (*pydantic-settings* reads `.env` and validates types at startup).
- `backend/app/services.py`: builds the long-lived objects once (DB repository, file storage, LLM, embedder, Chroma, BM25 cache). Routes receive them through `Depends(get_services)`. This is *dependency injection*: pass in what a function needs instead of creating it inside, so tests can pass fakes.
- `backend/app/db/repository.py`: the data-access interface. There are two implementations: `supabase_repo.py` (real Postgres through Supabase's REST layer, PostgREST) and `local_repo.py` (a JSON file, for the demo mode and tests).
- Logging: one line per event, `time level module: message` (`setup_logging` in `main.py`).

### The schema (`backend/migrations/001_init.sql`), as a DBMS answer

```
auth.users 1─1 profiles 1─* notebooks 1─* sources 1─* chunks
                              notebooks 1─* generations
                              notebooks 1─* chat_sessions 1─* chat_messages
```

| Table | Primary key | Foreign keys (all `ON DELETE CASCADE`) | Notable constraints |
|---|---|---|---|
| profiles | id (= auth user id) | id → auth.users | created by trigger on sign-up |
| notebooks | id uuid | user_id → profiles | `sources_version` counter |
| sources | id uuid | notebook_id → notebooks, user_id → profiles | `unique(notebook_id, content_hash)`, `status` CHECK |
| chunks | id uuid (deterministic) | source_id → sources, notebook_id → notebooks | `unique(source_id, chunk_index)` |
| generations | id uuid | notebook_id, user_id | `unique(notebook_id, pipeline_name, params_hash, sources_version)` = cache key |
| chat_sessions | id uuid | notebook_id, user_id | |
| chat_messages | id uuid | session_id → chat_sessions, notebook_id | `role` CHECK, `citations jsonb` |

- **Keys.** A *primary key* uniquely identifies a row. A *foreign key* must match a primary key in the parent table, which is *referential integrity*. UUIDs instead of 1, 2, 3: they can be generated anywhere (even before the insert, as we do for sources and chunks) and they don't reveal how many rows exist.
- **Relationships.** All are one-to-many. `ON DELETE CASCADE` means deleting a notebook deletes all its children in one statement, with no orphans.
- **Indexes: why each exists.**
  - `notebooks(user_id, created_at desc)`: "list my notebooks, newest first" becomes an index range scan with no sort step.
  - `sources(notebook_id, created_at)`, `chunks(notebook_id, created_at)`, `generations(notebook_id, created_at desc)`, `chat_sessions(notebook_id, created_at desc)`, `chat_messages(session_id, created_at)`: every screen lists children of one parent in time order.
  - `sources(user_id)`, `generations(user_id)`, `chat_sessions(user_id)`: used by the RLS policies and by `ON DELETE CASCADE` when a user is deleted. Without an index on a FK column, deleting the parent means a full scan of the child table.
  - `unique(source_id, chunk_index)` and `unique(notebook_id, content_hash)` are also indexes. Their leading column covers the plain FK lookups (the *leftmost-prefix rule*).
- **RLS (Row Level Security).** Postgres adds an automatic `WHERE user_id = auth.uid()` to every query on the table. Even if someone queries Supabase directly with their token, they only ever see their own rows. Our backend uses the service-role key (which bypasses RLS) and checks ownership in code, so RLS is *defence in depth*: a second lock on the door.
- **Normal form.** The schema is in **3NF** except for two deliberate, controlled redundancies:
  - `chunks.notebook_id` can be derived from `chunks.source_id → sources.notebook_id`. We store it so the most frequent query ("all chunks of a notebook") needs no join, and so it matches the Chroma metadata filter.
  - `sources/generations/chat_sessions.user_id` can be derived from the notebook. We store it so RLS policies are a simple `user_id = auth.uid()` instead of a sub-query.

  Both values are written once at insert and never updated, so there are no update anomalies. In an interview, say: "3NF with two intentional denormalisations for read performance and simpler security policies."
- **`sources_version` and the atomic counter.** `bump_sources_version()` is `UPDATE … SET v = v + 1 RETURNING v` in one statement, so two concurrent uploads can't both read 4 and write 5 (a *lost update*).

### Trade-offs
- Service-role key + code checks is simple, but a bug in a check isn't caught by the database. RLS is the safety net if someone uses the anon key directly.
- JSONB for `params`/`output`/`citations`: flexible for 16 different output shapes, at the cost of no column-level constraints (Pydantic validates before insert).

### 5 interview questions
1. **Why UUID primary keys?** They can be generated client- or server-side before insert (we derive chunk ids deterministically), they're safe to expose in URLs (not guessable, no row-count leak), and they merge easily across systems. The cost: 16 bytes instead of 4–8, and random insert order into the B+ tree index.
2. **What does `ON DELETE CASCADE` do and when is it dangerous?** Deleting a parent row automatically deletes its children. That's convenient for "delete notebook", but dangerous if a delete runs by mistake, because a lot of data goes at once. We scope deletes through ownership checks, and Supabase has backups.
3. **Explain RLS.** It's a per-table policy evaluated for every row. Our policy `user_id = auth.uid()` means that a query run with a user's JWT behaves as if `WHERE user_id = <me>` had been added. For `chunks` the policy uses `EXISTS (select 1 from notebooks where …)` because chunks have no user_id.
4. **Why store chunk text in Postgres if Chroma has it?** Postgres is the source of truth, with transactions, backups and RLS. Chroma is a derived search index that can be rebuilt (`scripts/reindex.py`), for example when the embedding model changes. We keep ids + vectors + metadata in Chroma, and the text in Postgres.
5. **How would you find slow queries here?** Run `EXPLAIN ANALYZE` on the query, look for sequential scans on large tables or a sort step, and add or adjust a composite index that matches both the `WHERE` and the `ORDER BY` columns, e.g. `(notebook_id, created_at)`.

**Self-check:** (2a) Which table relationship is enforced by the trigger rather than by the app? (2b) Why does `chunks` not need its own index on `source_id`? (2c) Name the two denormalised columns and justify one.

---

## 3. Ingestion

### Flow (`backend/app/ingest/pipeline.py`)
1. `POST /notebooks/{id}/sources` → `create_source()`: detect the type from the extension, check the size, compute a **SHA-256 hash** of the bytes. If `(notebook_id, hash)` already exists, return the existing source (`duplicate: true`). Otherwise upload the original to Supabase Storage at `user/notebook/source/filename` and insert a `sources` row with `status='uploaded'`.
2. The API returns **202 Accepted** immediately and schedules `run_ingestion()` as a FastAPI `BackgroundTask` (it runs in a worker thread after the response is sent).
3. `extracting`: `app/ingest/extract.py`
   - PDF: **pymupdf4llm** (a small add-on to PyMuPDF) turns each page into markdown, keeping the page numbers. Headings become `#` lines, so the chunker can split by section. A page with fewer than 25 characters is treated as scanned: render it to PNG at 150 dpi and send it to **Gemini vision** for OCR.
   - DOCX: python-docx paragraphs. Heading styles become markdown `#` lines so the chunker can see sections. Tables are included.
   - TXT/MD: decode UTF-8. Images: Gemini OCR. Audio: Gemini transcription.
4. `chunking`: `app/ingest/chunk.py` (below).
5. Chunk rows are written to Postgres **first** (it's the source of truth), with a *deterministic id* `uuid5(source_id:chunk_index)`.
6. `embedding`: `app/ingest/embed.py` embeds the texts in batches of 50 with a **contextual chunk header** (`Document: notes.pdf / Section: 2.1 Indexing` prepended; only the embedding sees it, the stored text is unchanged) and **upserts** them into Chroma with metadata `{notebook_id, source_id, page, chunk_index}`.
7. `ready`: bump `notebooks.sources_version` and invalidate the BM25 cache. Any exception sets `failed` plus `error_message`, and the UI shows a Retry button.

The UI polls `GET /sources/{id}` every 2 seconds until the status is `ready` or `failed`.

### The chunker (recursive splitter), in your own words
1. Break the text into small *units*, trying the most natural boundary first: paragraph → line → sentence (`. `) → word. A piece is only split further if it's still bigger than the max size (`split_to_fit`).
2. Greedily pack units into a chunk until the next one would pass the target (600 *tokens*; a token is about ¾ of a word, and we estimate 1 token ≈ 4 characters).
3. When a chunk is full, the next chunk **starts with the last ~15% of the previous one**. That's the *overlap*: a sentence that straddles a boundary appears whole in at least one chunk.
4. A new section heading closes the current chunk if it's at least half full, so chunks don't mix sections. Every chunk remembers `page`, `page_end` and `heading`.

### Chunk size and overlap trade-offs

| Smaller chunks (200) | Larger chunks (1000) |
|---|---|
| precise matches, cheaper context, exact citations | more surrounding context per hit |
| a single chunk may miss the explanation around a fact | embedding gets "averaged" over many topics, so retrieval is less precise |
| more vectors to store and search | fewer LLM tokens wasted? No: each hit brings more irrelevant text |

We chose **~600 tokens, 15% overlap**: a typical textbook subsection is 300–800 words, which is big enough to hold an explanation and small enough that its embedding stays on one topic. With too much overlap you store and retrieve duplicates (MMR later removes these). With none, facts split across boundaries get lost.

### Idempotency (*idempotent*: doing it twice has the same effect as doing it once)
- Same file again → same SHA-256 → the unique key `(notebook_id, content_hash)` → we return the existing row.
- Re-running ingestion for the same source → chunk rows are replaced and chunk ids are deterministic, so the Chroma **upsert** overwrites instead of duplicating. Stale vectors (if the new version has fewer chunks) are deleted first.
- A test proves it: `tests/test_api.py::test_upload_ingests_to_ready_and_is_idempotent` and `test_retry_does_not_duplicate_vectors`.

### 5 interview questions
1. **Why a background task and not do it in the request?** Extraction plus embedding can take tens of seconds. Holding the HTTP request open risks timeouts and blocks the user. We return 202 and expose a status field to poll. At scale I'd move it to a queue (Cloud Tasks/Pub/Sub + worker) so it survives restarts and can retry.
2. **How do you handle scanned PDFs?** Per page: if PyMuPDF finds almost no text, render the page to an image and use Gemini vision OCR. It's capped at `MAX_OCR_PAGES` to protect the quota.
3. **How is duplicate upload prevented under a race?** Two identical uploads can both pass the "exists?" check. The DB unique constraint rejects the second insert, and we catch that, delete its stored file and return the existing row.
4. **What is a contextual chunk header and why use it?** A chunk that says "it has O(log n) lookups" is ambiguous on its own. Before embedding we prepend "Document: dbms_notes.pdf / Section: 3. Indexing", so the vector also encodes *what* the chunk is about, and questions about B-tree indexes find it more reliably. The header is only used for the embedding; the text shown to users and the LLM is unchanged.
5. **What happens if the embedding API is down mid-ingestion?** Each call has retry with exponential backoff (1s, 2s, 4s… plus jitter) for 429/5xx. If all retries fail, the source is marked `failed` with the error, and the user can retry. The chunks are already safe in Postgres.

**Self-check:** (3a) Why must Postgres be written before Chroma? (3b) What makes the chunk id deterministic and why does that matter? (3c) What would go wrong with 0% overlap?

---

## 4. Multi-layer retrieval

`backend/app/retrieval/`: one file per layer, wired together in `retriever.py`.

```
query
  │ (1) scope.py    notebook (+ optional sources / page range)
  ├─(2) dense.py    embed query (RETRIEVAL_QUERY) → Chroma top-20, cosine
  ├─(3) keyword.py  BM25 top-20
  │ (4) fusion.py   Reciprocal Rank Fusion
  │ (5) rerank.py   MMR diversify (+ optional LLM rerank) → top 8
  ▼ (6) context.py  token budget, order by source+page, label [S1]…[Sn]
```

**(1) Scope filter.** The same `Scope` object becomes a Chroma `where` filter (`{"$and": [{"notebook_id": …}, {"source_id": {"$in": […]}}, {"page": {"$gte": 3}}]}`) and a Python check for BM25, so both retrievers search the same set.

**(2) Dense retrieval.** The query is embedded with *task_type* `RETRIEVAL_QUERY` (the chunks used `RETRIEVAL_DOCUMENT`; Gemini optimises the two sides differently), then Chroma's *HNSW* index (a graph that finds approximate nearest neighbours quickly) returns the 20 closest vectors. *Cosine similarity* measures the angle between vectors: 1 means the same direction (same meaning) and 0 means unrelated. Chroma returns cosine *distance* = 1 − similarity. Dense retrieval finds **paraphrases** ("keep committed data after a crash" → the chunk about the write-ahead log).

**(3) BM25.** For each query word in a chunk: `IDF × tf·(k1+1) / (tf + k1·(1 − b + b·len/avg_len))`.
- *IDF* = rare words count more ("ARIES" beats "data").
- *k1* = 1.5 gives term-frequency saturation: the 10th repeat adds little.
- *b* = 0.75 penalises long chunks so they don't win just by containing more words.

It finds **exact terms, acronyms, names and codes** that embeddings blur. The index is built in memory per notebook and cached, keyed by `sources_version`, so it's automatically rebuilt when sources change. We wrote BM25 ourselves because `rank_bm25`'s IDF goes negative for common words in small notebooks (see DECISIONS D9).

**(4) Reciprocal Rank Fusion.** The whiteboard version:
```python
def rrf(ranked_lists, k=60):
    scores = {}
    for ranked in ranked_lists:
        for rank, doc in enumerate(ranked, start=1):
            scores[doc] = scores.get(doc, 0) + 1 / (k + rank)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```
Why ranks and not scores: cosine (0–1) and BM25 (0–∞) aren't comparable. RRF needs no normalisation, and a document ranked well by **both** retrievers rises to the top. k = 60 is the value from the original paper (Cormack et al., 2009). It flattens the gap between rank 1 and rank 2 so no single list dominates.

**(5) MMR (Maximal Marginal Relevance).** Pick chunks one by one. Each time, choose the chunk that maximises `λ·relevance − (1−λ)·max_similarity_to_already_picked`, with λ = 0.7. *Relevance* is the fused RRF score scaled to 0..1, so MMR diversifies the hybrid ranking instead of replacing it (the eval caught an early bug where it used dense cosine only). This removes near-duplicates, which our own 15% overlap creates. The optional **LLM rerank** (`RERANK_WITH_LLM=true`) asks Gemini to read the top 10 and order them by usefulness, like a cross-encoder but with no extra model to host. It usually improves precision but costs one extra LLM call per query, which matters at 10 requests/minute on the free tier. The eval measures it as its own row (`hybrid_mmr_rerank`), so the decision to switch it on by default is based on numbers.

**(6) Context assembly.** Keep chunks in relevance order while they fit the budget (6,000 tokens for chat), then sort the kept ones by source and page so the model reads them in document order. Label them `[S1]…[Sn]` and keep the map `S3 → notes.pdf, p. 12, section "2.1 Indexing"`.

**Query rewriting** (`query_rewrite.py`): "what about its disadvantages?" becomes "What are the disadvantages of B-tree indexes?", using the last 6 messages. It's skipped on the first message to save an API call.

### Evaluation (`backend/eval/`)
- 3 committed study-note documents (written for this repo) and **33 questions**, each labelled with an *answer phrase*. A retrieved chunk is relevant if it contains the phrase. Phrase labels survive changes to the chunker, unlike hard-coded chunk ids.
- Questions are tagged `keyword` (they reuse the document's words) or `paraphrase` (they don't).
- Modes compared: dense, BM25, hybrid (RRF), hybrid + MMR, hybrid + MMR + LLM rerank.
- *Recall@5*: the share of questions whose answer is somewhere in the top 5. *MRR (Mean Reciprocal Rank)*: the average of 1/rank of the first correct chunk (rank 1 → 1.0, rank 2 → 0.5, missing → 0). Recall measures "did we find it"; MRR measures "how high".
- Run it with `cd backend && python -m eval.run_eval`. It prints the markdown table and saves `eval/results.md`. **Only numbers from that file go in the README or on the resume.**
- **Real results (2026-09-29, `backend/eval/results.md`):**
  - Dense MRR 0.89, BM25 0.94, hybrid 0.90.
  - Hybrid + MMR + **LLM rerank: 1.00** (Recall@1 went from 0.82 to 1.00).
  - Honest reading: on this small set BM25 alone beat dense (the notes use exact textbook terms), and RRF fixed dense's one top-5 miss but not rank 1. The reranker is what fixed rank 1. The benchmark is small and near its ceiling, so say "the rerank took Recall@1 from 0.82 to 1.00 on my 33-question benchmark", never "retrieval is 100% accurate".
- The eval uses 200-token chunks by default because the three documents are short: at 600 tokens they make only about 12 chunks, and every method looks perfect. Say this if asked: "I shrank the chunks for the benchmark so it could discriminate between methods. At production size the corpus was too small to be meaningful."

### 5 interview questions
1. **Why hybrid instead of just embeddings?** Dense retrieval misses exact tokens (error codes, acronyms, rare names) and BM25 misses paraphrases. They fail on different queries, so fusing them raises recall. My eval splits results into keyword and paraphrase questions to show this.
2. **Why RRF over a weighted sum of scores?** A weighted sum needs calibrated, comparable scores and a tuned weight. BM25 is unbounded and its scale changes per query. RRF uses ranks only: no tuning, robust, and it's 5 lines of code.
3. **What does MMR fix, and what does it cost?** It prevents the top-k from being five near-copies of one passage (common with overlapping chunks), so the context covers more distinct facts. The cost is that it can push a relevant-but-similar chunk down, so recall can dip slightly. It's a diversity/recall trade-off controlled by λ.
4. **How do you know retrieval is good?** I built a labelled set of 33 questions and measure Recall@5 and MRR for each configuration: dense, BM25, hybrid, hybrid + MMR. I quote those numbers, not impressions.
5. **How does it scale to 1M chunks?** Chroma's HNSW is approximately O(log n) per query. The BM25 index is in memory per notebook (notebooks are small). For huge corpora I'd move keyword search to Postgres full-text search or Elasticsearch/OpenSearch, run Chroma as a server (or use pgvector), and cache query embeddings.

**Self-check:** (4a) Compute the RRF score of a chunk ranked 1st by dense and 3rd by BM25 (k = 60). (4b) Why is the query embedded with a different task_type from the chunks? (4c) What does λ = 1.0 do to MMR?

---

## 5. RAG chat with citations

`backend/app/chat/rag_chat.py`, exposed by `POST /notebooks/{id}/chat`.

1. Get or create the chat session. Load the last `2 × CHAT_MAX_HISTORY_TURNS` (12) messages. Save the user's message.
2. Rewrite the query using history, then run the six-layer retrieval.
3. Send an **SSE** `meta` event with the session id, the rewritten query and all candidate citations.
4. Build the prompt: context blocks `[S1] (file, p. N)` + history + question. The system prompt says: *answer only from context; cite every factual sentence with [S#]; if it's not there, say "I couldn't find that in your sources."*
5. Stream Gemini tokens as `token` events. A deadline (`LLM_TIMEOUT_S`) cuts runaway answers.
6. Parse which `[S#]` labels the answer actually used, save the assistant message with only those citations (JSONB), and send a `done` event.
7. Any error becomes an `error` event with a human message (for example "rate-limited, wait a minute"). The stream never just dies.

*SSE (Server-Sent Events)*: one HTTP response that stays open and sends small text frames (`event: token\ndata: {...}\n\n`). It's simpler than WebSockets for one-way server → browser streaming. The browser uses `fetch()` + a stream reader because `EventSource` can't send a POST body or an auth header.

**Guardrails:** context token budget, max history turns, a streaming deadline, the "not in sources" answer, rate limiting and retries, and friendly error messages.

### 5 interview questions
1. **How do you reduce hallucinations?** Retrieval grounds the answer. The prompt forbids outside facts, requires a citation per factual sentence and gives an exact refusal sentence. Citations are verifiable in the UI (click `[S2]` to see the source snippet and page). If nothing is retrieved, we don't call the LLM at all.
2. **Why SSE and not WebSockets?** The traffic is one-directional, SSE is plain HTTP (works through proxies and load balancers, easy to debug), and the browser handles reconnection semantics. WebSockets are worth it only for bidirectional real-time traffic.
3. **How are citations mapped back to pages?** Context assembly assigns labels and keeps a label → (chunk, source name, page, heading, snippet) map. After streaming, a regex finds `[S\d+]` in the answer and we save only those citations.
4. **Why rewrite follow-up questions?** Retrieval uses only the query. A pronoun like "its" has no meaning to BM25 or embeddings. Rewriting resolves references using history, and the rewritten query is shown in the UI for transparency.
5. **What if Gemini is rate-limited mid-conversation?** Calls go through a sliding-window rate limiter and exponential backoff. If `OPENAI_API_KEY` is set, `FallbackLLM` switches providers when the first token fails. Otherwise the user gets a clear "please wait a minute" error event.

**Self-check:** (5a) Which SSE events arrive, in order, for a normal answer? (5b) Why are only the *used* citations saved? (5c) What happens when the notebook has no ready sources?

---

## 6. The 16 generation pipelines

`backend/app/generation/`

- `registry.py`: 16 `PipelineSpec` objects (name, title, retrieval_strategy, prompt_template, output_schema, counts per length). It's **data, not code**: one runner executes all of them.
- `schemas.py`: one Pydantic model per pipeline (quiz, flashcards, mind map…).
- `prompts.py`: system prompt + personalisation block + task.
- `runner.py`: cache check → gather material → prompt → JSON → validate → save.
- `map_reduce.py`: for long material. `mermaid.py`: mind-map JSON → Mermaid.

**The 16:** summary, key concepts, FAQ, MCQ quiz, flashcards, exam revision notes, study guide, outline, mind map, glossary, timeline, practice problems, simplified explanation, compare & contrast, podcast script, textbook chapter.

**Retrieval strategies**
- `whole_notebook_map_reduce` (summary, exam notes, study guide, outline, mind map, timeline): the output must cover everything.
- `top_k_for_topic` (key concepts, FAQ, quiz, flashcards, glossary, practice problems, simple explanation, compare): uses the retriever with `focus_topic` or a pipeline-specific default query.
- `per_source` (podcast, textbook chapter): each document is condensed separately, so none is drowned out.

**Personalisation:** `difficulty` (beginner / intermediate / advanced), `length` (short / medium / long) and `focus_topic` all change the prompt text:
- difficulty adds audience instructions;
- length changes the numbers (a quiz has 5/10/20 questions);
- focus changes both the retrieval query and the instructions.

`tests/test_generation_units.py::test_personalisation_changes_the_prompt` proves it.

**Structured output:** `generate_content(..., response_mime_type="application/json", response_json_schema=Model.model_json_schema())` makes Gemini emit JSON that matches the schema. We then `Model.model_validate_json()`. Validators catch logic errors (quiz `correct_index` out of range; compare table rows with the wrong number of values). On failure we **retry once**, pasting the validation error into the prompt. After that, 502 with a clear message.

**Map-reduce** (*map*: apply the same step to each piece independently; *reduce*: combine the results):
- Gemini Flash accepts about 1M input tokens, so **most notebooks go to the model in one call** (up to `GENERATION_SINGLE_PASS_TOKENS` = 150k tokens). That's fewer steps and fewer failure points.
- Only for really huge notebooks (map-reduce is the *fallback*): group the chunks into ~60k-token groups. The **map** step asks the model to extract notes relevant to the target document (e.g. "a quiz", with the focus topic). The **reduce** step concatenates the notes; if they're still too long, repeat (at most 3 rounds). Then the final pipeline prompt runs once on the notes.
- Why keep it at all: the free tier limits tokens per minute (about 250k), and a single 800-page prompt would also dilute the model's attention. Map-reduce makes any size work, but it only runs when it's needed.

**Caching:** the key is `(notebook_id, pipeline, params_hash, sources_version)`, which is a unique constraint in `generations`. `params_hash` is a SHA-256 of the normalised params (sorted keys, lower-cased focus topic, sorted source ids). Adding or deleting a source bumps `sources_version`, so stale outputs are never served. `force: true` regenerates.

### 5 interview questions
1. **Why one registry instead of 16 endpoints/classes?** All pipelines share the same flow and differ only in configuration. A registry removes 16× duplication, keeps behaviour consistent (caching, validation, errors) and makes a new pipeline a 10-line change.
2. **How do you guarantee the quiz JSON is usable?** Three layers: schema-constrained decoding, Pydantic validation (including semantic rules like a valid answer index), and one repair retry with the exact error. Then the renderer can rely on the shape.
3. **Explain map-reduce and its weakness.** Condense chunk groups independently, then combine. The weakness: cross-group connections can be lost, because each map call sees only its group. Mitigations: large groups, a goal-aware map prompt, and keeping source and page labels in the notes.
4. **How does caching stay correct?** `sources_version` is part of the key and is bumped atomically by a Postgres function whenever the notebook's sources change. Params are hashed after normalisation, so logically identical requests hit the same row.
5. **How would you make generation faster?** Run map calls in parallel (bounded by the rate limit), stream partial results, precompute notebook summaries at ingestion, and use a smaller or faster model for the map step (we already disable "thinking" there with `thinking_budget=0`).

**Self-check:** (6a) Which strategy does `compare_contrast` use and why? (6b) What two things change in the prompt when length goes from short to long? (6c) Why does the mind map not ask Gemini for Mermaid directly?

---

## 7. React frontend

`frontend/`: React 19 + Vite, plain JavaScript and CSS.
- `src/lib/api.js`: `fetch` wrapper that adds `Authorization: Bearer <supabase session token>` and turns `{"detail": …}` into thrown errors.
- `src/lib/sse.js`: reads the chat stream with `response.body.getReader()`, splits frames on blank lines and dispatches `meta`/`token`/`done`/`error`.
- Auth: `@supabase/supabase-js` `signInWithPassword` / `signUp`. The session token is refreshed automatically. When `VITE_SUPABASE_URL` is empty the app runs in **demo mode** with no login.
- Server state: **React Query** (`useQuery`/`useMutation`) handles caching, refetching after mutations, and `refetchInterval: 2000` to poll sources while any is processing.
- Pages: login, notebook list, notebook workspace (sources panel, pipeline grid, output renderers, chat panel).
- Renderers: the quiz is interactive (select → reveal → score), flashcards flip with a CSS 3D transform, and the mind map is rendered by `mermaid.render()` from the backend's Mermaid text. Citations `[S1]` become clickable chips that show the source, page and snippet.
- Design: a "chalkboard and highlighter" system (`frontend/DESIGN.md`). Chalkboard-green slate background, chalk text, **yellow only where something is being pointed at** (citations, the cited passage, the selected format, the landing highlight), violet only for primary actions. Two typefaces with two jobs: Bricolage Grotesque for the interface, Literata (a serif made for long reading) for everything the student *reads*: outputs, answers, source passages. Radii follow hierarchy (4px controls, 10px panels, exercise-book covers with a square spine edge). One orchestrated motion (the landing highlighter swipe); everything else moves only in response to the user, and `prefers-reduced-motion` turns it off.
- Extra features on top of the basics: a landing page whose hero is a live demo (one lecture paragraph, click any of the 16 formats to see it transformed); notebooks as exercise-book covers; the Studio grouped by goal (Understand / Practise / Revise / Read & listen); a source reader; **citation jump** (click `S3` in chat → the exact passage, highlighted); quiz "Retry the ones I missed"; flashcards with "Got it / Again" self-rating (Again cards return at the end; progress saved in `localStorage`); Copy as Markdown, Download `.md`, Export for Anki `.csv` (`src/lib/exportMarkdown.js`); suggested questions built from the notes' section headings; a Stop button that aborts the stream.
- Interview questions this invites: *"Why two typefaces?"* (interface vs reading are different jobs; a serif at 17px/1.65 is easier for long study text). *"Why is yellow restricted?"* (it carries one meaning, "this is the thing being pointed at", so the eye can trust it). *"How does citation jump work?"* (each citation carries `chunk_id` + `source_id`; the reader fetches `GET /sources/{id}/chunks` and scrolls to that chunk). *"How is Anki export built?"* (front,back CSV with quotes doubled and fields wrapped, unit-tested).

### 5 interview questions
1. **Why React Query?** Server state (lists that must refetch, poll, invalidate after an upload) is different from UI state. React Query gives caching, deduping, retries and polling declaratively instead of hand-written `useEffect` + loading flags.
2. **How is login handled?** supabase-js signs the user in and stores and refreshes the session. Every API call sends the current access token as a Bearer header. The backend asks Supabase Auth `auth.get_user(token)` who it belongs to, which checks the signature, the expiry and whether the session was revoked, and caches the answer for 60 s (`app/auth.py`).
3. **How does streaming render?** A `fetch` POST reads chunks from `ReadableStream`, parses SSE frames, and appends each `token` text to the last message in state. React re-renders incrementally.
4. **Why not TypeScript/Tailwind/MUI?** Fewer moving parts to explain and a smaller bundle. The design system is small enough for CSS variables. I'd add TypeScript as the team or codebase grows.
5. **How do you handle a 90-second generation in the UI?** A loading state with an elapsed-seconds counter, the button disabled, the cached badge shown instantly for repeats, and errors shown inline with the backend message.

**Self-check:** (7a) Why can't `EventSource` be used for chat? (7b) Where does the polling stop? (7c) What does demo mode change?

---

## 8. Shipping

- **Tests (`backend/tests/`, 88 tests, no API key needed):** chunker, RRF (exact values), MMR, BM25 (including the negative-IDF regression), scope, context assembly, all 16 schemas, the validation-repair loop, retries/rate limiter, JWT verification, and full API flows (upload → ready → idempotent re-upload, search layers, every pipeline + cache, chat SSE + citations + query rewrite) using `FakeLLM`/`FakeEmbedder` (`tests/fakes.py`).
- **CI (`.github/workflows/ci.yml`):** on every push, `ruff check` + `pytest` for the backend and `npm ci && npm run build` for the frontend.
- **Docker:** `backend/Dockerfile` is multi-stage (build wheels in stage 1, copy into a slim non-root runtime in stage 2). Local development doesn't need Docker (Chroma is embedded).
- **Deploy:** [`DEPLOY_GCP.md`](DEPLOY_GCP.md) covers Cloud Build → Artifact Registry → Cloud Run, Secret Manager for keys, and three options for Chroma on an ephemeral filesystem.

### 5 interview questions
1. **How do you test code that calls an LLM?** Put the LLM behind an interface (`LLM`/`Embedder` protocols in `app/llm/base.py`) and inject fakes in tests. The fakes return schema-valid canned outputs and deterministic bag-of-words embeddings, so tests are fast, free and deterministic. Quality is measured separately with the eval.
2. **Why a multi-stage Dockerfile?** Compilers and build caches stay out of the runtime image, which gives a smaller attack surface and faster pulls and cold starts.
3. **What breaks on Cloud Run specifically?** The ephemeral disk (embedded Chroma), CPU throttling after the response (background tasks: use `--no-cpu-throttling`), and request timeouts for long generations (raise the timeout). See DEPLOY_GCP.md.
4. **How are secrets handled?** Locally only in git-ignored `.env`, with `.env.example` documenting the names. In GCP they're in Secret Manager, mounted as env vars. The frontend only ever gets the Supabase *anon* key, which is safe to expose because RLS protects the data.
5. **What would you monitor in production?** Ingestion failure rate and duration, generation latency (stored per row), 429 counts, cache hit rate, chat time-to-first-token, and a nightly eval run to catch retrieval regressions.

**Self-check:** (8a) Name two things `FakeEmbedder` must guarantee for tests to be meaningful. (8b) Why is the Supabase anon key safe in the browser but the service-role key isn't? (8c) Which setting keeps BackgroundTasks alive on Cloud Run?

---

## 9. Resume → code map

| Resume claim | Where it is true | Status |
|---|---|---|
| RAG-based platform converting academic documents | `app/ingest/*` (PDF/DOCX/TXT/MD/image/audio) + `app/retrieval/*` + `app/chat/rag_chat.py` | ✅ |
| **16** personalized content-generation pipelines | `app/generation/registry.py` (asserts `len == 16`), personalisation in `app/generation/prompts.py` | ✅ |
| structured prompts | `app/generation/prompts.py`, `schemas.py` + Gemini `response_json_schema` in `app/llm/gemini.py::generate_json` | ✅ |
| retrieval pipelines | `app/retrieval/retriever.py` + three strategies in `app/generation/runner.py::gather_material` | ✅ |
| multi-layer retrieval pipeline | scope → dense → BM25 → RRF → MMR (+LLM rerank) → context: `app/retrieval/{scope,dense,keyword,fusion,rerank,context}.py` | ✅ |
| ChromaDB | `app/vector_store.py` (PersistentClient, cosine HNSW) | ✅ |
| Gemini embeddings | `app/llm/gemini.py::_embed`, default `gemini-embedding-001` (768-d, separate document/query task types), stored in `sources.embedding_model` and shown at `/health` | ✅ Resume should say **gemini-embedding-001** (text-embedding-004 was retired by Google) |
| prompt orchestration | query rewrite → retrieval → grounded prompt → stream (chat); cache → map-reduce → JSON → validate → repair (pipelines) | ✅ |
| high-quality learning outputs | schema validation + repair; measured retrieval (`eval/results.md`) | ✅ (only quote measured numbers) |
| Presented and defended at the master's viva | v1 (`legacy-go/`, tag `v1-go`) | ✅ for v1: say "v1 at the viva, later re-architected" |
| React.js | `frontend/` (React 19 + Vite) | ✅ |
| FastAPI | `backend/app/main.py`, `app/api/*` | ✅ |
| Google Gemini Flash | `LLM_MODEL=gemini-3.8-flash` (default) in `app/config.py`, used by `app/llm/gemini.py`; also verified end-to-end on `gemini-2.5-flash` | ✅ Resume: "Gemini 3.8 Flash" (or "Gemini Flash") |
| **LangChainGo** | only in v1 (`legacy-go/`, `go.mod`: `tmc/langchaingo v0.1.14`) | ✅ historically; v2 does **not** use it. Say "v1 used LangChainGo; v2 moved to Python" |
| ChromaDB | above | ✅ |
| Supabase | Postgres schema + RLS (`migrations/001_init.sql`), Auth (`app/auth.py` verifies tokens with `auth.get_user`), Storage (`app/db/supabase_repo.py::SupabaseFileStorage`) | ✅ once you create the project and run the migration |
| RAG, Semantic Search | dense retrieval with Gemini embeddings + Chroma | ✅ |

**Suggested accurate resume wording** (use whatever `/health` shows for the embedding model):

> **StudyForge: AI-Powered Document-to-Learning Platform** · React, FastAPI, Gemini 3.8 Flash, ChromaDB, Supabase (Postgres/Auth/Storage)
> - Built a RAG platform that turns PDFs, DOCX, slides-as-images and audio into **16 personalized study pipelines** (quizzes, flashcards, mind maps, study guides…) using schema-validated structured LLM output and map-reduce for long documents.
> - Designed a **6-layer hybrid retrieval pipeline** (metadata scoping → Gemini embeddings in ChromaDB + BM25 → Reciprocal Rank Fusion → MMR → cited context assembly), evaluated on a labelled set with Recall@5 = **X** and MRR = **Y** *(fill in from eval/results.md)*.
> - v1 (Go + LangChainGo) presented and defended at the M.Sc. viva; re-architected as v2 with streaming cited chat, idempotent ingestion, RLS-secured Postgres and CI.

Interview story for the embedding change: "The project started on text-embedding-004. Google deprecated it, so v2 uses gemini-embedding-001. The model is a config value, vectors live in a collection named after the model so different models are never mixed, and `scripts/reindex.py` re-embeds everything from Postgres without re-parsing files."

---

## 10. Viva in 5 minutes

*(About 650 words ≈ 5 minutes spoken. Draw the section-0 diagram while you talk.)*

**Problem (30 s).** "Students have PDFs, slides and lecture recordings, but what they need for exams is quizzes, flashcards, summaries and answers they can trust. StudyForge turns a notebook of documents into 16 kinds of study material and a chat that answers only from those documents, with page-level citations."

**Architecture (60 s).** "A React front end talks to a FastAPI back end. Supabase provides Postgres, authentication and file storage. Chunk vectors live in ChromaDB, and Gemini 3.8 Flash does generation, OCR and transcription, with Gemini embeddings for search. Postgres is the source of truth for chunk text; Chroma is a rebuildable search index. Every table has row-level security, so a user can only ever read their own notebooks."

**Ingestion (45 s).** "Upload returns immediately with 202 and a background task takes over. It extracts text page by page (pymupdf4llm for PDFs, Gemini vision for scanned pages), then splits it with a recursive chunker into ~600-token chunks with 15% overlap. Each chunk keeps its page and section heading. Chunks are embedded in batches and upserted into Chroma with deterministic ids, so re-uploading the same file (same SHA-256) never creates duplicates. The UI polls a status field."

**Retrieval (90 s): slow down here.** "Retrieval has six layers. First, a scope filter restricts to the notebook, and optionally to some documents or pages. Then two retrievers run: dense search with query embeddings in Chroma, which catches paraphrases, and BM25, which catches exact terms like acronyms. Their scores aren't comparable, so I fuse the rankings with Reciprocal Rank Fusion: each document scores the sum of 1/(60 + rank). Then Maximal Marginal Relevance removes near-duplicates, which overlapping chunks create, and context assembly fits a token budget and labels each chunk S1, S2 with its source and page. For chat, follow-up questions are first rewritten into standalone queries. I evaluated this on 33 labelled questions: On my 33-question benchmark, dense retrieval put the right chunk first 82% of the time; adding the LLM rerank layer made it 100%, with MRR going from 0.90 to 1.00. It's a small set, so I use it to compare layers, not as an absolute score."

**Generation (60 s).** "The 16 pipelines are one registry of configurations run by one runner. Each has a retrieval strategy: whole-notebook with map-reduce for summaries and outlines, top-k retrieval for quizzes and flashcards, or per-source for the textbook chapter. Difficulty, length and focus topic change the prompt. Gemini returns JSON constrained by a Pydantic schema. I validate it, including rules like 'the quiz answer index must exist', and retry once with the error if it fails. Results are cached by notebook, pipeline, parameters and a sources version that bumps whenever documents change."

**Engineering (30 s).** "Every Gemini call goes through a rate limiter and exponential backoff, with an optional OpenAI fallback. There are 88 tests that run without API keys using fake models, CI on every push, a multi-stage Dockerfile and Cloud Run deployment notes."

**History (15 s).** "The version I defended at my viva was Go with LangChainGo and keyword retrieval. v2 is the re-architecture with real embeddings and hybrid search. Both are in the repo."

---

## 11. The 15 hardest questions

1. **"Your v1 claimed embeddings but didn't use them. Why should I trust v2?"** "Fair. v1's embedding config was never wired up; retrieval was keyword matching. I've documented that in V1_AUDIT.md. v2 has an eval script with labelled questions, so the retrieval claims are measured, and you can run it yourself: `python -m eval.run_eval`."
2. **"Why not just use LangChain / LlamaIndex?"** "I wanted every layer to be explainable and testable: RRF, BM25 and MMR are each a few lines. Frameworks hide defaults (chunking, prompt templates, retries) that I'd have to reverse-engineer to debug. For a production team I'd consider them for integrations, but the core ranking logic is simple enough to own."
3. **"What's your chunk size and how did you choose it?"** "About 600 tokens with 15% overlap, section-aware. The reasoning: big enough to hold an explanation, small enough to stay on one topic. I didn't tune it rigorously. The eval script takes `--chunk-tokens`, so the next step is to sweep 300/600/900 and pick by MRR."
4. **"Your eval set is 33 questions you wrote. Isn't that biased?"** "Yes, it's small and self-authored, so treat the numbers as a regression test and a relative comparison between methods, not an absolute quality score. Improvements: more documents, questions written by someone else, and LLM-generated questions spot-checked by hand."
5. **"How do you prevent prompt injection from uploaded documents?"** "Document text only ever appears inside the CONTEXT block, and the system prompt tells the model to treat it as material, not instructions. Outputs are schema-validated, the model has no tools or side effects, and it can only return text. Residual risk: a document could bias an answer, which is why citations are shown."
6. **"What happens with two backend instances?"** "Embedded Chroma is per-instance, so I'd switch to `CHROMA_MODE=http` (a shared Chroma server) or pgvector. The BM25 cache is per-process but self-heals via `sources_version`. Background tasks should move to a queue. Postgres is already shared."
7. **"How do you handle the embedding model being deprecated?"** "It's a config value with automatic fallback, and vectors are stored in a collection named after the model, so models are never mixed. Changing models means running `scripts/reindex.py`, which re-embeds from Postgres without re-parsing files."
8. **"Why cosine similarity, and why normalise?"** "Direction matters more than magnitude for semantic similarity. When vectors are L2-normalised, cosine equals the dot product. Google requires normalisation for truncated gemini-embedding-001 vectors, so I normalise everything."
9. **"Walk me through what happens if two users upload the same file into the same notebook simultaneously."** "Both compute the same hash. Both might pass the exists check, but the unique `(notebook_id, content_hash)` constraint lets only one insert succeed. The loser catches the error, deletes its uploaded blob and returns the winner's row. Notebooks belong to one user, though, so realistically it's a double-click."
10. **"What's the time complexity of your retrieval?"** "Dense is approximately O(log n) per query via HNSW. BM25 is O(n × q) over the notebook's chunks (fine for notebooks of thousands of chunks) plus a one-time O(total tokens) index build that's cached. RRF is O(k). MMR is O(k² · d) with k ≈ 30 candidates and d = 768: tiny."
11. **"Why does the backend use the service-role key? Isn't that dangerous?"** "It bypasses RLS, so every route checks ownership, returns 404 for foreign ids, and tests cover it. It's needed because ingestion runs in the background without a user token. The key lives only on the server (Secret Manager in GCP). RLS still protects direct client access."
12. **"How would you add streaming to the 16 pipelines?"** "Structured JSON streams awkwardly, because partial JSON isn't valid. Options: stream map-reduce progress events, or stream per-item (one quiz question per event) with a JSONL-style schema. I'd start with progress events over SSE, like chat."
13. **"Your token counter is characters/4. Isn't that wrong?"** "It's an approximation. Budgets keep margins (6k tokens of context against a 1M-token model limit), so exact counts don't change behaviour. Gemini's `count_tokens` endpoint exists if exact accounting is ever needed, but it costs an API call."
14. **"How do you know the model didn't hallucinate a citation?"** "Citations are resolved server-side: only labels that exist in the context map are saved, and each points to a real chunk with page and snippet. The model can still attach a real label to a claim that label doesn't support. Checking that would need an NLI/LLM verification pass, which I'd add as a next step."
15. **"What would you change with more time?"** "A job queue for ingestion, pgvector or a Chroma server for multi-instance deploys, a chunk-size sweep and a larger eval set, citation verification, and streaming progress for pipelines."

---

## 12. Answers to self-check questions

- **1a** For the fraction of the query's *characters* that appear anywhere in the chunk. **1b** `legacy-go/` (see `go.mod` and `backend/agent.go`). **1c** The study-output catalogue from `prompt.go` (summary, FAQ, study guide, outline, podcast, timeline, glossary, quiz, mind map, exam notes, textbook) and the chat grounding rules.
- **2a** `profiles` ↔ `auth.users`: the `on_auth_user_created` trigger inserts the profile. **2b** The unique constraint `(source_id, chunk_index)` creates an index whose leading column is `source_id`. **2c** `chunks.notebook_id` (avoids a join for the hottest query and matches the Chroma filter) and `user_id` on sources/generations/chat_sessions (simple RLS policies).
- **3a** Postgres is the source of truth. If embedding fails, the chunks are still saved, and the index can be rebuilt from them. **3b** `uuid5(namespace, "source_id:chunk_index")`: re-ingestion produces the same ids, so Chroma upserts overwrite instead of duplicating. **3c** A fact spanning a boundary would be cut in half and possibly never retrieved whole.
- **4a** 1/61 + 1/63 ≈ 0.01639 + 0.01587 = 0.03226. **4b** Gemini embeddings are asymmetric: queries (short questions) and documents (long passages) are optimised to meet in the same space. **4c** Pure relevance: MMR returns the fused order unchanged.
- **5a** `meta` → `token` × n → `done` (or `error`). **5b** Candidate citations include chunks the model didn't use, and saving only used ones keeps the UI honest. **5c** No retrieval happens, and the answer is "I couldn't find that in your sources…" without calling the LLM.
- **6a** `top_k_for_topic`: comparisons need the most relevant passages about the specific concepts, not the whole notebook. **6b** The count in the task (e.g. 4 → 10 aspects) and the length guidance sentence. **6c** LLM-written Mermaid often has syntax errors (quotes, brackets). Rendering from JSON in code is always valid.
- **7a** `EventSource` only does GET and can't set an `Authorization` header or send a JSON body. **7b** When no source is in a processing status (`uploaded/extracting/chunking/embedding`), `refetchInterval` returns `false`. **7c** No login screen, no auth header, and a "Demo mode" badge. The backend's `AUTH_MODE=dev` uses a fixed user.
- **8a** Deterministic (same text → same vector) and similarity-preserving (texts that share words get similar vectors), so retrieval tests can assert rankings. **8b** The anon key can only do what RLS allows for the signed-in user; the service-role key bypasses RLS entirely. **8c** `--no-cpu-throttling` (CPU always allocated).
