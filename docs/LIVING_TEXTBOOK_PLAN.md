# The living textbook: plan

*StudyForge's real idea, as described in the blackbook (objective 4, research gap 2.4, future scope 7.3.1
"chunked textbook generation"), taken to its conclusion. This document is the plan.*

**Status:** phase 1 (knowledge map) and phase 2 (the book: outline, sections, stale-per-section,
reader with evidence rail, glossary hover, "since you last read") are built; see `backend/app/knowledge`,
`backend/app/book`, `migrations/002`–`003`, DECISIONS D27–D28. Phases 3–5 are not started.

## 1. What we are building, in one paragraph

A notebook is a course. You drop in everything for that course, thirty sources if you like: the two
textbooks, the lecture slides, your own notes, a recording. StudyForge reads all of it and writes **one
book** for that course: chapters in a sensible order, a glossary, an index, cross-references, figures,
and every paragraph pointing at the page it came from. When you add a thirty-first source, the book
does not get regenerated; it **grows**: new concepts get placed, the chapters they touch get revised,
and the book tells you what changed since you last read it. The quizzes, flashcards and chat still
exist, but they hang off the book. That is the difference from a chatbot over PDFs.

## 2. What v1 got right, and where it stopped

| v1 (blackbook) | Kept | Changed |
|---|---|---|
| One textbook per notebook (`textbooks` table, one row, whole Markdown) | one book per notebook | the book is stored as **sections**, not one blob |
| Stale detection when a source changes (algorithm A.5) | stale detection | per **section**, not per book; and the book heals itself instead of asking you to regenerate everything |
| Chapter template prompt | chapter structure | chapters come from a **concept map** built from the sources, not from one prompt's guess |
| Limitation 7.2: "truncates input beyond the context window" | | sections are written from the specific passages that support them, so size of the notebook no longer matters |
| Gap 2.4: "retrieval over sources + notes + textbook together" | | chat becomes "ask the book": it searches book sections and source passages together |

## 3. The idea underneath: a book is rendered from a knowledge model

The mistake in v1 (and in every "generate a summary of everything" feature) is treating the book as
**text**. Text cannot be updated incrementally; you can only rewrite it. So the book is instead
rendered from a **structured layer** that can be updated one piece at a time:

```
sources ──► passages ──► CONCEPTS + CLAIMS + EVIDENCE ──► OUTLINE ──► SECTIONS ──► the book
                          (the knowledge model)            (plan)     (written text)   (reader)
```

- **Concept**: a thing the course is about ("B+ tree", "ACID", "Belady's anomaly"). Has a name,
  aliases, a one-line definition, and links to other concepts (*is part of*, *requires*,
  *contrasts with*).
- **Claim**: one atomic statement from a source ("A table can have only one clustered index"),
  attached to a concept, with its **evidence**: the passage id, source, page.
- **Outline**: the chapters and sections, each owning a set of concepts, ordered so prerequisites
  come first.
- **Section**: written prose for one outline node, built only from its concepts' claims. Every
  paragraph records the evidence passages it used. Versioned. Can be `current` or `stale`.

Everything a reader sees is derived from this: the glossary is the concepts, the index is the
concepts' aliases, cross-references are the concept links, the "what changed" banner is the diff of
concepts and sections between two versions, and citations are the evidence.

## 4. The pipeline, stage by stage

### Stage A: extract (runs per source, right after chunking)

For each passage, ask Gemini for structured JSON: the concepts it defines or uses and the atomic
claims it makes, each claim tied to the passage. Cheap and parallel per source; a 30-source notebook
costs 30 × (its chunks / batch) calls, spread over time as sources arrive.

Output: `concepts` (candidate, per source) and `claims` rows, each with `chunk_id`.

### Stage B: merge (per source, after A)

Candidate concepts are matched against the notebook's existing concepts:

1. embed `name + definition`, nearest neighbours in Chroma (same store, a second collection);
2. above a similarity threshold, Gemini adjudicates: *same concept* (merge, add alias),
   *distinct*, or *conflicting definitions* (keep both, flag a **conflict** with both sources);
3. below the threshold: a new concept.

This is the step that makes the book "encyclopaedic" rather than repetitive: thirty sources that all
define normalisation produce **one** glossary entry with thirty pieces of evidence, not thirty entries.
Concept links (requires / part-of / contrasts-with) come from the same call.

### Stage C: plan the outline (per notebook, when the concept set changed)

First time: Gemini sees only the **concept names and links** (a few hundred tokens per hundred
concepts, so this never hits a context limit) and proposes chapters and sections, each owning
concepts. Prerequisite links give the ordering (a topological sort with the LLM's order as tie-break).

Every later time: Gemini sees the **current outline plus only the new or changed concepts** and is
asked to *place* them: into an existing section, or as a new section. The outline is stable by
construction; it only grows or gets small edits. Sections whose concept set changed become `stale`.

### Stage D: write sections (only stale ones)

For each stale section: gather its concepts' claims and the evidence passages behind them (this is
retrieval by concept, not by query), and ask Gemini for structured output: paragraphs, each with the
list of passage ids it relied on; optional figure specs (see stage F); "see also" concept references.
A **support check** follows: for each paragraph, a fast Gemini call answers "is this paragraph
supported by these passages?" Unsupported paragraphs are marked and rewritten once, then shown with
a warning if still unsupported. This is the hallucination control, and it produces a number we can
report: **citation support rate**.

Writing a section costs one or two calls; adding a source to a 20-chapter book typically touches
two or three sections, so the whole "evolution" is a handful of calls, not a rewrite.

### Stage E: assemble and diff

Assemble the book view: table of contents, sections, glossary (concepts A–Z with definitions and
evidence), index (aliases → sections), cross-references (concept links → section links), and the
**changelog**: for version *n* vs the version the user last opened, list new concepts, revised
sections, new conflicts. The reader shows this as "Since you last read: 3 new concepts, 2 sections
revised, 1 place where your sources disagree."

### Stage F: figures (later phase)

Never LLM-drawn images. Figures are **rendered by code from structured data**, the same decision as
the mind map:
- concept maps per chapter (Mermaid, from concept links),
- timelines (Mermaid `timeline`, from dated claims),
- comparison tables (from *contrasts-with* links and their claims),
- charts (Vega-Lite or Chart.js) only when a source contains a numeric table that extraction captured.

## 5. What the reader sees

- **The Book** tab becomes the notebook's main view (Sources | Book | Study tools | Chat).
- Left: table of contents with a small "revised" mark on sections changed since the last visit.
- Centre: the section in Literata, with a **margin evidence rail**: hovering a paragraph shows
  "from Lecture 7, p. 3 and Textbook A, p. 212"; clicking opens the source reader at the passage
  (the citation jump that already exists).
- Glossary terms in the text are underlined with the highlighter treatment; hovering shows the
  definition; clicking goes to the glossary entry, which lists every source that defines the term.
- A **Conflicts** panel: "Textbook A says X; your lecture notes say Y", with both passages.
- A **What changed** banner after the book evolves, with a link per change.
- Chapter-level actions that reuse the 16 formats: "Quiz me on this chapter", "Flashcards for this
  chapter", "Explain this section more simply" (they run on the section's concepts and evidence, so
  they are consistent with the book).
- Export: Markdown, and later PDF and EPUB with the figures rendered.

## 6. Data model additions (Supabase)

```
concepts        (id, notebook_id, name, definition, aliases[], status current|conflicted,
                 first_version, last_version)
concept_links   (from_id, to_id, kind requires|part_of|contrasts_with, evidence_chunk_id)
claims          (id, notebook_id, concept_id, text, chunk_id, source_id, page, version)
book_outlines   (notebook_id, version, outline_json)                -- chapters/sections/concept ids
book_sections   (id, notebook_id, chapter_index, section_index, title, content_json,
                 concept_ids[], evidence_chunk_ids[], version, status current|stale|writing|failed,
                 support_rate)
book_changes    (notebook_id, version, changes_json, created_at)   -- for "what changed"
book_reads      (user_id, notebook_id, last_seen_version, section_progress_json)
jobs            (id, notebook_id, kind, stage, status, progress, error, created_at, updated_at)
```
Chroma gets a second collection per notebook for concept embeddings. Row-level security as for the
existing tables. `sources_version` keeps driving invalidation.

## 7. Phases

Each phase is demoable on its own and the interview story gets stronger at every step.

**Phase 1: the knowledge map (foundation).**
Stages A and B. A "Knowledge map" page per notebook: concepts A–Z with definitions, aliases, evidence
count, and a concept graph (Mermaid). Conflicts listed. *Demo: upload three sources that overlap;
show one merged concept with three pieces of evidence.* This alone is a differentiator.

**Phase 2: the book (MVP of the living textbook).**
Stages C, D, E without figures. Book reader with TOC, evidence rail, glossary hover, citation jump.
Stale-per-section, background jobs with progress. *Demo: a 10-source notebook becomes a book; add an
11th source; only two sections are rewritten; the banner says what changed.*

**Phase 3: trust and evolution.**
Support check and support rate shown per section; conflicts panel; changelog history; version
browsing ("show me the book as it was before I added source 11"); cost controls and quotas.

**Phase 4: figures and export.**
Stage F; Markdown, PDF and EPUB export; print stylesheet.

**Phase 5: the learner in the loop.**
Reading progress; quiz results per chapter feed a "weak spots" view in the book; "explain this
differently" per section; chat becomes "ask the book" (retrieval over sections + passages); a
cross-notebook search.

## 8. Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| Cost: 30 sources × extraction × merge | extraction is per source and runs once; merging compares against embeddings first and only asks the LLM for near-matches; sections are written only when stale; all of it runs in background jobs with visible progress and a per-notebook budget |
| Duplicate or over-split concepts | the merge step with alias tracking; a "merge these" / "split this" action in the knowledge map so the user can correct it; corrections are remembered |
| Hallucinated prose | every paragraph carries evidence; the support check marks unsupported paragraphs; the support rate is measured and shown, never claimed |
| Outline churn (book reorganises itself every time) | later runs only *place* new concepts into the existing outline; restructuring is a user action ("re-plan the outline") |
| Sources that disagree | conflicts are a first-class object shown with both passages, not silently resolved |
| Context limits (v1's limitation) | no stage ever sees a whole notebook; the outline step sees names only, sections see their own evidence |
| Evaluation | add to `eval/`: concept extraction against a hand-labelled set (precision/recall), merge correctness on a seeded duplicate set, citation support rate on generated sections |

## 9. What this changes on the resume and in the interview

The honest headline becomes: *"a living textbook: a knowledge model (concepts, claims, evidence)
extracted from all sources and merged across them, from which a versioned, cited book is rendered and
updated incrementally as sources are added."* That is a knowledge-graph + incremental-synthesis story,
which is a level above "RAG chatbot" and defensible line by line: extraction, entity resolution
(merge), planning, grounded generation, verification, and evaluation each map to one stage and one
table.

## 10. Decisions (taken 2026-09-29)

1. **The Book is the notebook's main tab**; the 16 formats move under "Study tools".
2. **Concept granularity**: glossary-worthy terms *and* named examples (algorithms, people, systems,
   worked examples that a source names). Examples are tagged `kind = example` so the glossary can
   list terms first and examples after.
3. **Budget**: free-tier cap by default: background extraction processes about 150 passages an hour
   and queues the rest, with progress shown in the app. Remove the cap when a paid key is configured.
4. **Incoming claims are triaged by similarity, then a one-line verification call**:
   - *duplicate* (the book already states it): no new prose; the existing claim gains the new
     source as extra evidence;
   - *contradiction* (same subject, opposite statement): the book keeps its current statement and
     records the disagreement with both passages in the Conflicts panel; nothing is silently dropped;
   - *new*: placed into the outline.
   The lookup is an embedding nearest-neighbour search in Chroma over existing claims; the
   verification is a short "same / contradicts / unrelated" call. No separate model.
