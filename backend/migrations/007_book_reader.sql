-- StudyForge: reader settings, code examples / process diagrams, and revertable editions.
-- Run once in the Supabase SQL Editor after 006_figures_search.sql. Safe to re-run.
--
--   books.settings          how the reader wants the book written (level, depth, examples, code)
--   book_sections.extras    code examples and process steps of a section (drawn by code)
--   book_snapshots          the whole book at each of the last 5 versions, for "revert to this version"

alter table public.books add column if not exists settings jsonb not null default '{}';
alter table public.book_sections add column if not exists extras jsonb not null default '{}';

create table if not exists public.book_snapshots (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    version     integer not null,
    sections    jsonb not null,
    created_at  timestamptz not null default now(),
    unique (notebook_id, version)
);
create index if not exists book_snapshots_notebook_created_idx on public.book_snapshots (notebook_id, created_at);

alter table public.book_snapshots enable row level security;
drop policy if exists "rows of own notebooks" on public.book_snapshots;
create policy "rows of own notebooks" on public.book_snapshots for all using (
    exists (select 1 from public.notebooks n where n.id = book_snapshots.notebook_id and n.user_id = auth.uid())
);
