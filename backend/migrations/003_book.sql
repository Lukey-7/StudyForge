-- StudyForge: the book rendered from the knowledge model (docs/LIVING_TEXTBOOK_PLAN.md, phase 2).
-- Run once in the Supabase SQL Editor after 002_knowledge.sql. Safe to re-run.
--
--   notebooks 1─1 books (the current version number)
--   notebooks 1─* book_sections (the outline and the written text; one row per section)
--   notebooks 1─* book_changes (what each version changed, for "since you last read")
--   notebooks 1─* book_reads (the version each reader last saw)

-- ---------------------------------------------------------------- the book's version
create table if not exists public.books (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null unique references public.notebooks (id) on delete cascade,
    version     integer not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- sections (outline + text)
-- The outline is the ordered set of sections: (chapter_index, section_index).
-- paragraphs: [{"text": "...", "chunk_ids": ["..."]}]; fingerprint: hash of the claims and
-- evidence of the section's concepts when it was written. A different hash means "stale".
create table if not exists public.book_sections (
    id            uuid primary key default gen_random_uuid(),
    notebook_id   uuid not null references public.notebooks (id) on delete cascade,
    chapter_index integer not null,
    chapter_title text not null,
    section_index integer not null,
    title         text not null,
    concept_ids   uuid[] not null default '{}',
    paragraphs    jsonb not null default '[]',
    see_also      text[] not null default '{}',
    fingerprint   text,
    status        text not null default 'stale' check (status in ('stale', 'writing', 'current', 'failed')),
    version       integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists book_sections_notebook_created_idx on public.book_sections (notebook_id, created_at);

-- ---------------------------------------------------------------- change log
create table if not exists public.book_changes (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    version     integer not null,
    changes     jsonb not null default '{}',
    created_at  timestamptz not null default now()
);
create index if not exists book_changes_notebook_created_idx on public.book_changes (notebook_id, created_at);

-- ---------------------------------------------------------------- what each reader has seen
create table if not exists public.book_reads (
    id                uuid primary key default gen_random_uuid(),
    notebook_id       uuid not null references public.notebooks (id) on delete cascade,
    user_id           uuid not null references public.profiles (id) on delete cascade,
    last_seen_version integer not null default 0,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (notebook_id, user_id)
);
create index if not exists book_reads_user_id_idx on public.book_reads (user_id);

-- ---------------------------------------------------------------- jobs: extraction or book writing
alter table public.knowledge_jobs add column if not exists kind text not null default 'extract';
alter table public.knowledge_jobs drop constraint if exists knowledge_jobs_kind_check;
alter table public.knowledge_jobs add constraint knowledge_jobs_kind_check check (kind in ('extract', 'book'));

-- ---------------------------------------------------------------- row level security
do $$
declare t text;
begin
    foreach t in array array['books', 'book_sections', 'book_changes', 'book_reads'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists "rows of own notebooks" on public.%I', t);
        execute format(
            'create policy "rows of own notebooks" on public.%I for all using (exists '
            '(select 1 from public.notebooks n where n.id = %I.notebook_id and n.user_id = auth.uid()))',
            t, t);
    end loop;
end $$;
