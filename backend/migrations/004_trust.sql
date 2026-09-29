-- StudyForge: trust and evolution for the book (docs/LIVING_TEXTBOOK_PLAN.md, phase 3).
-- Run once in the Supabase SQL Editor after 003_book.sql. Safe to re-run.
--
--   book_sections.support_rate      share of paragraphs a check found supported by their passages
--                                   (each paragraph in `paragraphs` carries its own "support")
--   book_section_versions           the text of a section each time it was written (version browsing)
--   knowledge_jobs.llm_calls        Gemini calls a job made (cost shown in the app)

alter table public.book_sections add column if not exists support_rate real;

create table if not exists public.book_section_versions (
    id           uuid primary key default gen_random_uuid(),
    notebook_id  uuid not null references public.notebooks (id) on delete cascade,
    section_id   uuid not null references public.book_sections (id) on delete cascade,
    version      integer not null,
    title        text not null,
    paragraphs   jsonb not null default '[]',
    support_rate real,
    created_at   timestamptz not null default now(),
    unique (section_id, version)
);
create index if not exists book_section_versions_notebook_created_idx on public.book_section_versions (notebook_id, created_at);
create index if not exists book_section_versions_section_id_idx on public.book_section_versions (section_id);

alter table public.knowledge_jobs add column if not exists llm_calls integer not null default 0;

alter table public.book_section_versions enable row level security;
drop policy if exists "rows of own notebooks" on public.book_section_versions;
create policy "rows of own notebooks" on public.book_section_versions for all using (
    exists (select 1 from public.notebooks n where n.id = book_section_versions.notebook_id and n.user_id = auth.uid())
);
