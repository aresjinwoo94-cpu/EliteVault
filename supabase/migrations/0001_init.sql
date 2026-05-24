-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — initial schema (resilient version)
-- pgvector is OPTIONAL: if the extension isn't available on this Supabase
-- project the migration still completes and image-similarity-by-embedding
-- gracefully degrades to the Claude re-ranker.
-- ──────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── pgvector (best-effort) ────────────────────────────────────────────────
do $$
begin
  create extension if not exists "vector";
exception when others then
  raise notice 'pgvector unavailable, skipping vector support: %', sqlerrm;
end $$;

-- ── enums ─────────────────────────────────────────────────────────────────
do $$ begin
  create type plan_tier as enum ('free', 'pro', 'scale');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum (
    'trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type analysis_status as enum ('queued','running','succeeded','failed','refunded');
exception when duplicate_object then null; end $$;

-- ── profiles ──────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  stripe_customer_id text unique,
  plan plan_tier not null default 'free',
  credits int not null default 1,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id);

-- ── subscriptions ─────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status subscription_status not null,
  price_id text not null,
  plan plan_tier not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);

-- ── stripe_events ─────────────────────────────────────────────────────────
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

-- ── analyses ──────────────────────────────────────────────────────────────
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status analysis_status not null default 'queued',
  url text,
  screenshot_url text,
  buyer_persona jsonb,
  result jsonb,
  rewrite jsonb,
  error text,
  credits_charged int not null default 1,
  inngest_run_id text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists analyses_user_created_idx
  on public.analyses(user_id, created_at desc);

-- ── winning_sites ─────────────────────────────────────────────────────────
create table if not exists public.winning_sites (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  domain text not null,
  title text not null,
  description text,
  niche text not null,
  thumbnail_url text not null,
  metrics jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  added_by_ai boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists winning_sites_niche_idx on public.winning_sites(niche);
create index if not exists winning_sites_featured_idx on public.winning_sites(is_featured);

-- Try to add the embedding column + HNSW index ONLY if pgvector is loaded.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter table public.winning_sites add column if not exists embedding vector(1024)';
    begin
      execute 'create index if not exists winning_sites_embedding_idx on public.winning_sites using hnsw (embedding vector_cosine_ops)';
    exception when others then
      raise notice 'Could not create HNSW index: %', sqlerrm;
    end;
  else
    raise notice 'pgvector not enabled — skipping embedding column';
  end if;
end $$;

-- ── search_history ────────────────────────────────────────────────────────
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('text','image')),
  query text,
  image_url text,
  result_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists search_history_user_idx
  on public.search_history(user_id, created_at desc);

-- ── updated_at trigger ────────────────────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- ── auto-create profile on signup ────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── match_winning_sites RPC (only if pgvector enabled) ───────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute $f$
      create or replace function public.match_winning_sites(
        query_embedding vector(1024),
        match_count int default 12,
        niche_filter text default null
      )
      returns table (
        id uuid, url text, title text, niche text,
        thumbnail_url text, metrics jsonb, similarity float
      )
      language sql stable as $body$
        select w.id, w.url, w.title, w.niche, w.thumbnail_url, w.metrics,
               1 - (w.embedding <=> query_embedding) as similarity
        from public.winning_sites w
        where w.embedding is not null
          and (niche_filter is null or w.niche = niche_filter)
        order by w.embedding <=> query_embedding
        limit match_count;
      $body$;
    $f$;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.analyses        enable row level security;
alter table public.search_history  enable row level security;
alter table public.winning_sites   enable row level security;
alter table public.stripe_events   enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "subs: read own" on public.subscriptions;
create policy "subs: read own" on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "analyses: read own" on public.analyses;
create policy "analyses: read own" on public.analyses
  for select using (auth.uid() = user_id);
drop policy if exists "analyses: insert own" on public.analyses;
create policy "analyses: insert own" on public.analyses
  for insert with check (auth.uid() = user_id);
drop policy if exists "analyses: update own" on public.analyses;
create policy "analyses: update own" on public.analyses
  for update using (auth.uid() = user_id);

drop policy if exists "search: read own" on public.search_history;
create policy "search: read own" on public.search_history
  for select using (auth.uid() = user_id);
drop policy if exists "search: insert own" on public.search_history;
create policy "search: insert own" on public.search_history
  for insert with check (auth.uid() = user_id);

drop policy if exists "sites: public read" on public.winning_sites;
create policy "sites: public read" on public.winning_sites
  for select using (true);
