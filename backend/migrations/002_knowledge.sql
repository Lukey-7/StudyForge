-- StudyForge: the knowledge model behind the living textbook (docs/LIVING_TEXTBOOK_PLAN.md).
-- Run once in the Supabase SQL Editor after 001_init.sql. Safe to re-run.
--
--   notebooks 1─* concepts 1─* claims 1─* claim_evidence *─1 chunks
--   notebooks 1─* concept_links (concept -> concept)
--   notebooks 1─* conflicts (a claim + a passage that contradicts it)
--   notebooks 1─* knowledge_jobs (progress of building the map)

-- ---------------------------------------------------------------- concepts
create table if not exists public.concepts (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    name        text not null,
    kind        text not null default 'term' check (kind in ('term', 'example')),
    definition  text not null default '',
    aliases     text[] not null default '{}',
    status      text not null default 'current' check (status in ('current', 'conflicted')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
-- one concept per name per notebook (case-insensitive): the merge step relies on it
create unique index if not exists concepts_notebook_name_idx on public.concepts (notebook_id, lower(name));
create index if not exists concepts_notebook_created_idx on public.concepts (notebook_id, created_at);
create index if not exists concepts_user_id_idx on public.concepts (user_id);

-- ---------------------------------------------------------------- links between concepts
create table if not exists public.concept_links (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    from_id     uuid not null references public.concepts (id) on delete cascade,
    to_id       uuid not null references public.concepts (id) on delete cascade,
    kind        text not null check (kind in ('requires', 'part_of', 'contrasts_with')),
    created_at  timestamptz not null default now(),
    unique (from_id, to_id, kind)
);
create index if not exists concept_links_notebook_created_idx on public.concept_links (notebook_id, created_at);
create index if not exists concept_links_to_id_idx on public.concept_links (to_id);

-- ---------------------------------------------------------------- claims and their evidence
create table if not exists public.claims (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    concept_id  uuid not null references public.concepts (id) on delete cascade,
    text        text not null,
    created_at  timestamptz not null default now()
);
create index if not exists claims_notebook_created_idx on public.claims (notebook_id, created_at);
create index if not exists claims_concept_id_idx on public.claims (concept_id);

-- A claim stated by several sources has several evidence rows: that is how a duplicate
-- becomes "one more source" instead of repeated text.
create table if not exists public.claim_evidence (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    claim_id    uuid not null references public.claims (id) on delete cascade,
    chunk_id    uuid not null references public.chunks (id) on delete cascade,
    source_id   uuid not null references public.sources (id) on delete cascade,
    page        integer,
    created_at  timestamptz not null default now(),
    unique (claim_id, chunk_id)
);
create index if not exists claim_evidence_notebook_created_idx on public.claim_evidence (notebook_id, created_at);
create index if not exists claim_evidence_chunk_id_idx on public.claim_evidence (chunk_id);
create index if not exists claim_evidence_source_id_idx on public.claim_evidence (source_id);

-- ---------------------------------------------------------------- conflicts between sources
create table if not exists public.conflicts (
    id                uuid primary key default gen_random_uuid(),
    notebook_id       uuid not null references public.notebooks (id) on delete cascade,
    claim_id          uuid not null references public.claims (id) on delete cascade,
    contradicting_text text not null,
    chunk_id          uuid not null references public.chunks (id) on delete cascade,
    source_id         uuid not null references public.sources (id) on delete cascade,
    page              integer,
    created_at        timestamptz not null default now()
);
create index if not exists conflicts_notebook_created_idx on public.conflicts (notebook_id, created_at);
create index if not exists conflicts_claim_id_idx on public.conflicts (claim_id);
create index if not exists conflicts_chunk_id_idx on public.conflicts (chunk_id);
create index if not exists conflicts_source_id_idx on public.conflicts (source_id);

-- ---------------------------------------------------------------- build progress
create table if not exists public.knowledge_jobs (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    source_id   uuid references public.sources (id) on delete cascade,
    status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
    progress    integer not null default 0,
    detail      text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists knowledge_jobs_notebook_created_idx on public.knowledge_jobs (notebook_id, created_at desc);
create index if not exists knowledge_jobs_source_id_idx on public.knowledge_jobs (source_id);

-- ---------------------------------------------------------------- row level security
-- Same model as 001: the backend uses the service-role key and checks ownership in code;
-- RLS protects direct queries. Everything is scoped through the owning notebook.
do $$
declare t text;
begin
    foreach t in array array['concepts', 'concept_links', 'claims', 'claim_evidence', 'conflicts', 'knowledge_jobs'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists "rows of own notebooks" on public.%I', t);
        execute format(
            'create policy "rows of own notebooks" on public.%I for all using (exists '
            '(select 1 from public.notebooks n where n.id = %I.notebook_id and n.user_id = auth.uid()))',
            t, t);
    end loop;
end $$;
