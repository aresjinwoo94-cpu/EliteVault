-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0012 Continuous Monitoring (Phase 3, event → habit)
--
-- Users save their own store + up to N competitors (N per plan). A weekly job
-- re-scores each store (cheap Flash quick-score — NOT the full audit, to keep
-- COGS flat and to avoid touching the Analyzer pipeline) and emails a digest
-- of what moved. This turns a one-off audit into a recurring reason to return.
--
-- RLS: users fully own their monitored_stores (CRUD). score_snapshots are
-- read-own; writes happen ONLY via the service role (the job). Idempotent.
-- ──────────────────────────────────────────────────────────────────────────

do $$ begin create type monitored_kind as enum ('self','competitor'); exception when duplicate_object then null; end $$;

-- ── monitored_stores: the user's store + competitors ──────────────────────
create table if not exists public.monitored_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  domain text not null,
  label text,
  kind monitored_kind not null default 'competitor',
  is_active boolean not null default true,
  last_score int,
  last_audited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index if not exists monitored_stores_user_idx on public.monitored_stores(user_id);
create index if not exists monitored_stores_active_idx
  on public.monitored_stores(is_active);

-- ── score_snapshots: weekly score history per monitored store ─────────────
create table if not exists public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  monitored_store_id uuid not null
    references public.monitored_stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null,
  week date not null,
  created_at timestamptz not null default now(),
  unique (monitored_store_id, week)
);
create index if not exists score_snapshots_store_week_idx
  on public.score_snapshots(monitored_store_id, week desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.monitored_stores enable row level security;
alter table public.score_snapshots  enable row level security;

-- monitored_stores: full own CRUD (server actions run as the user).
drop policy if exists "monitored: read own" on public.monitored_stores;
create policy "monitored: read own" on public.monitored_stores
  for select using (auth.uid() = user_id);
drop policy if exists "monitored: insert own" on public.monitored_stores;
create policy "monitored: insert own" on public.monitored_stores
  for insert with check (auth.uid() = user_id);
drop policy if exists "monitored: update own" on public.monitored_stores;
create policy "monitored: update own" on public.monitored_stores
  for update using (auth.uid() = user_id);
drop policy if exists "monitored: delete own" on public.monitored_stores;
create policy "monitored: delete own" on public.monitored_stores
  for delete using (auth.uid() = user_id);

-- score_snapshots: read own; inserts only via service role (the job).
drop policy if exists "snapshots: read own" on public.score_snapshots;
create policy "snapshots: read own" on public.score_snapshots
  for select using (auth.uid() = user_id);

-- updated_at-style touch not needed (rows are immutable snapshots).
