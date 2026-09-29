-- StudyForge v2 schema (Supabase Postgres).
-- Run once in the Supabase dashboard -> SQL Editor (or `psql -f`). Safe to re-run.
--
-- Relationships (all 1-to-many, all ON DELETE CASCADE):
--   auth.users 1─1 profiles 1─* notebooks 1─* sources 1─* chunks
--                                notebooks 1─* generations
--                                notebooks 1─* chat_sessions 1─* chat_messages

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    email        text,
    display_name text,
    created_at   timestamptz not null default now()
);

-- Create a profile row automatically whenever someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- --------------------------------------------------------------- notebooks
create table if not exists public.notebooks (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles (id) on delete cascade,
    title           text not null check (char_length(title) between 1 and 200),
    description     text,
    sources_version integer not null default 0,  -- bumped when sources change; part of the generation cache key
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists notebooks_user_id_created_idx on public.notebooks (user_id, created_at desc);

-- ----------------------------------------------------------------- sources
create table if not exists public.sources (
    id              uuid primary key default gen_random_uuid(),
    notebook_id     uuid not null references public.notebooks (id) on delete cascade,
    user_id         uuid not null references public.profiles (id) on delete cascade,
    file_name       text not null,
    file_type       text not null,              -- pdf | docx | text | image | audio
    mime_type       text,
    storage_path    text not null,
    content_hash    text not null,              -- sha256 of the bytes -> idempotent uploads
    size_bytes      bigint not null default 0,
    status          text not null default 'uploaded'
                    check (status in ('uploaded','extracting','chunking','embedding','ready','failed')),
    error_message   text,
    page_count      integer,
    chunk_count     integer not null default 0,
    embedding_model text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (notebook_id, content_hash)
);
create index if not exists sources_notebook_created_idx on public.sources (notebook_id, created_at);
create index if not exists sources_user_id_idx on public.sources (user_id);

-- ------------------------------------------------------------------ chunks
-- Postgres is the SOURCE OF TRUTH for chunk text; Chroma only holds the vectors
-- (it can always be rebuilt from this table: scripts/reindex.py).
create table if not exists public.chunks (
    id          uuid primary key,             -- deterministic uuid5(source_id, chunk_index), same id in Chroma
    source_id   uuid not null references public.sources (id) on delete cascade,
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    chunk_index integer not null,
    page        integer,
    page_end    integer,
    heading     text,
    text        text not null,
    token_count integer not null,
    created_at  timestamptz not null default now(),
    unique (source_id, chunk_index)
);
-- (source_id, chunk_index) unique constraint already indexes source_id (leading column).
create index if not exists chunks_notebook_created_idx on public.chunks (notebook_id, created_at);

-- ------------------------------------------------------------- generations
create table if not exists public.generations (
    id              uuid primary key default gen_random_uuid(),
    notebook_id     uuid not null references public.notebooks (id) on delete cascade,
    user_id         uuid not null references public.profiles (id) on delete cascade,
    pipeline_name   text not null,
    params          jsonb not null default '{}'::jsonb,
    params_hash     text not null,
    sources_version integer not null,
    output          jsonb not null,
    model           text not null,
    latency_ms      integer not null,
    created_at      timestamptz not null default now(),
    unique (notebook_id, pipeline_name, params_hash, sources_version)  -- the cache key
);
create index if not exists generations_notebook_created_idx on public.generations (notebook_id, created_at desc);
create index if not exists generations_user_id_idx on public.generations (user_id);

-- ------------------------------------------------------------ chat_sessions
create table if not exists public.chat_sessions (
    id          uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references public.notebooks (id) on delete cascade,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    title       text not null default 'New chat',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists chat_sessions_notebook_created_idx on public.chat_sessions (notebook_id, created_at desc);
create index if not exists chat_sessions_user_id_idx on public.chat_sessions (user_id);

-- ------------------------------------------------------------ chat_messages
create table if not exists public.chat_messages (
    id              uuid primary key default gen_random_uuid(),
    session_id      uuid not null references public.chat_sessions (id) on delete cascade,
    notebook_id     uuid not null references public.notebooks (id) on delete cascade,
    role            text not null check (role in ('user','assistant')),
    content         text not null,
    rewritten_query text,
    citations       jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now()
);
create index if not exists chat_messages_session_created_idx on public.chat_messages (session_id, created_at);
create index if not exists chat_messages_notebook_created_idx on public.chat_messages (notebook_id, created_at);

-- ------------------------------------------------ atomic version counter
create or replace function public.bump_sources_version(p_notebook_id uuid) returns integer
language sql as $$
    update public.notebooks
       set sources_version = sources_version + 1, updated_at = now()
     where id = p_notebook_id
    returning sources_version;
$$;

-- -------------------------------------------------------- row level security
-- The FastAPI backend uses the service-role key (bypasses RLS) and checks
-- ownership in code. RLS is defence in depth: if anyone queries the database
-- directly with a user's JWT (e.g. supabase-js in the browser), they can only
-- ever see their own rows.
alter table public.profiles      enable row level security;
alter table public.notebooks     enable row level security;
alter table public.sources       enable row level security;
alter table public.chunks        enable row level security;
alter table public.generations   enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
    for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own notebooks" on public.notebooks;
create policy "own notebooks" on public.notebooks
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own sources" on public.sources;
create policy "own sources" on public.sources
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own generations" on public.generations;
create policy "own generations" on public.generations
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own chat sessions" on public.chat_sessions;
create policy "own chat sessions" on public.chat_sessions
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- chunks and chat_messages have no user_id column: ownership is checked through the parent.
drop policy if exists "chunks of own notebooks" on public.chunks;
create policy "chunks of own notebooks" on public.chunks
    for all using (exists (select 1 from public.notebooks n where n.id = chunks.notebook_id and n.user_id = auth.uid()));

drop policy if exists "messages of own sessions" on public.chat_messages;
create policy "messages of own sessions" on public.chat_messages
    for all using (exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid()));

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;
