-- ══════════════════════════════════════════════════════════════════════════
-- EliteVault — 0020 Sessions (real-time visitors + session duration)
--
-- The owner dashboard needs live "who's on the site right now" + session
-- DURATION. `page_views` (0015) is append-only per pageview, so it can't
-- express liveness/duration. This table holds ONE row per browser session,
-- upserted by a client heartbeat (~15s): first beat inserts (started_at),
-- later beats bump last_seen_at.
--
--   • active session = last_seen_at within the last ~45s
--   • duration       = last_seen_at − started_at
--   • is_internal    = owner/admin sessions are recorded but flagged, so the
--     owner can SEE tracking works without polluting the public metrics.
--
-- Service-role only (RLS on, no policies) — same posture as page_views.
-- Reversible: rollbacks/0020.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.sessions (
  session_id      text primary key,
  anon_id         text,
  user_id         uuid references auth.users(id) on delete set null,
  started_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  path            text,
  referrer_domain text,
  country         text,
  city            text,
  device          text,
  is_internal     boolean not null default false
);

create index if not exists sessions_last_seen_idx on public.sessions (last_seen_at desc);

alter table public.sessions enable row level security;
-- No policies on purpose: only the service role (server) reads/writes.
