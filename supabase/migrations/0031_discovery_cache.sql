-- ──────────────────────────────────────────────────────────────────────────
-- WP-1 — discovery cache keyed by URL hash.
--
-- Mirrors screenshot_cache (migration 0009) exactly: same url_hash key, same
-- service-role-only access, same self-healing contract. Re-auditing a store
-- within the TTL reuses the parsed page content instead of re-fetching and
-- re-parsing the HTML (a 10s-capped fetch that runs on every audit today).
--
-- The payload is the DiscoverySummary from lib/site-discovery.ts — public page
-- content the audit already reads, never user data.
--
-- Freshness is enforced by the READER (lib/discovery-cache.ts filters on
-- updated_at against DISCOVERY_CACHE_TTL_MINUTES, default 180) rather than by
-- expiry here, so the TTL can be tuned by env without a migration.
--
-- Idempotent. No edits to existing migrations.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.discovery_cache (
  url_hash text primary key,
  url text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The reader always filters on updated_at, so keep that lookup cheap as the
-- table grows (the primary key covers url_hash on its own).
create index if not exists discovery_cache_updated_at_idx
  on public.discovery_cache (updated_at desc);

-- Reads/writes go exclusively through the service-role client in the Inngest
-- worker. RLS on with NO policies means anon/auth clients can't touch it; the
-- service role bypasses RLS. Same posture as screenshot_cache.
alter table public.discovery_cache enable row level security;
