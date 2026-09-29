-- StudyForge: timelines, charts and semantic search for the book.
-- Run once in the Supabase SQL Editor after 005_learner.sql. Safe to re-run.
--
--   timeline_events         dated events a passage states (drawn as a chapter timeline)
--   data_tables             tables of numbers a passage contains (drawn as charts)
--   book_sections.indexed   whether the section's text is embedded in Chroma (semantic search)

create table if not exists public.timeline_events (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    concept_id  uuid not null references public.concepts (id) on delete cascade,
    source_id   uuid not null references public.sources (id) on delete cascade,
    chunk_id    uuid not null references public.chunks (id) on delete cascade,
    date_text   text not null,
    year        integer not null,
    event       text not null,
    created_at  timestamptz not null default now()
);
create index if not exists timeline_events_notebook_created_idx on public.timeline_events (notebook_id, created_at);
create index if not exists timeline_events_source_id_idx on public.timeline_events (source_id);

create table if not exists public.data_tables (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    concept_id  uuid not null references public.concepts (id) on delete cascade,
    source_id   uuid not null references public.sources (id) on delete cascade,
    chunk_id    uuid not null references public.chunks (id) on delete cascade,
    title       text not null,
    columns     jsonb not null,
    rows        jsonb not null,
    created_at  timestamptz not null default now()
);
create index if not exists data_tables_notebook_created_idx on public.data_tables (notebook_id, created_at);
create index if not exists data_tables_source_id_idx on public.data_tables (source_id);

alter table public.book_sections add column if not exists indexed boolean not null default false;

do $$
declare t text;
begin
    foreach t in array array['timeline_events', 'data_tables'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists "rows of own notebooks" on public.%I', t);
        execute format(
            'create policy "rows of own notebooks" on public.%I for all using (exists '
            '(select 1 from public.notebooks n where n.id = %I.notebook_id and n.user_id = auth.uid()))',
            t, t);
    end loop;
end $$;
