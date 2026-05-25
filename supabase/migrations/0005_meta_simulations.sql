-- ──────────────────────────────────────────────────────────────────────────
-- v3.0 — Meta Campaign Scenario Modeler
--
-- One row per "I ran the simulator on this analysis with these inputs".
-- A single analysis can have multiple simulations (different AOV / budget
-- assumptions). We cache the 3 scenarios as JSONB so re-renders are free.
-- ──────────────────────────────────────────────────────────────────────────

do $$ begin
  create type simulation_status as enum ('queued', 'running', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.meta_simulations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- User-provided inputs (the math is grounded in these, not invented)
  aov_usd numeric(10,2) not null,           -- average order value
  daily_budget_usd numeric(10,2) not null,  -- intended daily spend
  product_margin_pct numeric(5,2),          -- optional: gross margin %
  notes text,                               -- free-form context

  -- The 3 scenarios — each is a JSON object matching SimulationScenario
  conservative jsonb,
  balanced jsonb,
  aggressive jsonb,

  status simulation_status not null default 'queued',
  error text,
  inngest_run_id text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists meta_simulations_analysis_idx
  on public.meta_simulations(analysis_id, created_at desc);
create index if not exists meta_simulations_user_idx
  on public.meta_simulations(user_id, created_at desc);

-- RLS — same pattern as analyses: users only see their own.
alter table public.meta_simulations enable row level security;

drop policy if exists "sim: read own" on public.meta_simulations;
create policy "sim: read own"
  on public.meta_simulations for select
  using (auth.uid() = user_id);

drop policy if exists "sim: insert own" on public.meta_simulations;
create policy "sim: insert own"
  on public.meta_simulations for insert
  with check (auth.uid() = user_id);

drop policy if exists "sim: update own" on public.meta_simulations;
create policy "sim: update own"
  on public.meta_simulations for update
  using (auth.uid() = user_id);
