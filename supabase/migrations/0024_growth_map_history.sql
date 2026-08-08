-- ──────────────────────────────────────────────────────────────────────────
-- 0024 — Growth Map re-run movement history (brief §1.2).
--
-- Additive only. A lightweight placement point per normalized domain so a LATER
-- run of the same store can show the delta ("48 → 57 · crossed The Wall") — the
-- retention hook. One row per analysis, written once at Growth Map build time
-- via the service-role client; read back (service role only) to compute the
-- movement shown in the map header.
--
-- Touches nothing else: no analyzer scoring, no changes to analyses. Fully
-- reversible — see rollbacks/0024_growth_map_history_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.growth_map_history (
  id           uuid primary key default gen_random_uuid(),
  domain       text not null,
  user_id      uuid references auth.users(id) on delete set null,
  analysis_id  uuid references public.analyses(id) on delete set null,
  composite    smallint not null,   -- 0..100 composite at this run
  rank_index   smallint not null,   -- 0..5 rank index at this run
  created_at   timestamptz not null default now()
);

-- Latest-point-per-domain lookups drive the movement delta.
create index if not exists growth_map_history_domain_idx
  on public.growth_map_history (domain, created_at desc);

alter table public.growth_map_history enable row level security;
-- No policies on purpose: only the service role (server) reads/writes, exactly
-- like public.sessions (0020). The movement layer never reaches a client
-- directly — it's decorated onto the Growth Map payload server-side.
