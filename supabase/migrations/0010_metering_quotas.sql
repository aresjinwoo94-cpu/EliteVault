-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0010 metering & quotas (Phase 1)
--
-- Adds an inference-cost ledger (`usage_events`): one row per Gemini/Claude
-- call, with estimated tokens + cost. This protects the margin (our true
-- COGS is inference) by making per-user cost visible and by giving the
-- server-side quota guard a single source of truth.
--
-- Idempotent and NON-DESTRUCTIVE: it never touches the existing credit
-- system (`profiles.credits` stays the backing store for the analysis
-- quota, so the Analyzer behaves exactly as before).
-- ──────────────────────────────────────────────────────────────────────────

-- ── usage_events: the inference cost ledger ───────────────────────────────
create table if not exists public.usage_events (
  id           uuid primary key default gen_random_uuid(),
  -- nullable: system jobs (e.g. the weekly Trends refresh) have no user.
  user_id      uuid references public.profiles(id) on delete set null,
  -- plan at the time of the call (snapshot; cheaper than joining historically).
  plan         plan_tier,
  -- what kind of call: 'analyzer' | 'meta_ads' | 'meta_simulation' |
  -- 'quick_score' | 'rewrite' | 'search' | 'library_discovery' |
  -- 'trend_refresh' | 'monitor_reaudit' | 'other'
  event_type   text not null,
  -- model that served the call (e.g. 'gemini-2.5-pro' / 'gemini-2.5-flash').
  model        text,
  provider     text not null default 'gemini',
  prompt_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens  int not null default 0,
  -- estimated USD cost (clearly an ESTIMATE; see lib/usage/meter.ts pricing).
  est_cost_usd numeric(12,6) not null default 0,
  -- free-form context: { analysisId?, niche?, requestPath?, ... }
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_type_idx
  on public.usage_events (event_type);
create index if not exists usage_events_created_idx
  on public.usage_events (created_at desc);

-- ── RLS: users read their OWN usage; inserts happen ONLY via service role ──
-- (the meter writes with the service client, which bypasses RLS). There is
-- deliberately NO insert/update policy for authenticated users — the client
-- must never be able to forge or tamper with cost rows.
alter table public.usage_events enable row level security;

drop policy if exists "usage: read own" on public.usage_events;
create policy "usage: read own" on public.usage_events
  for select using (auth.uid() = user_id);

-- ── Internal cost view: per-user cost over the last 30 days ────────────────
-- Queried server-side via the service client from the INTERNAL_EMAILS-gated
-- page, so RLS on the underlying table does not block it. security_invoker
-- is left default (the service role bypasses RLS anyway).
create or replace view public.v_user_cost_30d as
  select
    u.user_id,
    p.email,
    p.plan,
    count(*)                         as calls,
    sum(u.total_tokens)::bigint      as tokens,
    round(sum(u.est_cost_usd), 4)    as cost_usd_30d,
    max(u.created_at)                as last_call_at
  from public.usage_events u
  left join public.profiles p on p.id = u.user_id
  where u.created_at > now() - interval '30 days'
  group by u.user_id, p.email, p.plan
  order by cost_usd_30d desc nulls last;
