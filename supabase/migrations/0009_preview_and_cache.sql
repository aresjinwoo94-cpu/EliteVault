-- ──────────────────────────────────────────────────────────────────────────
-- v4 — Performance + UX:
--   • P1.2 — instant teaser score. We persist a fast preliminary score +
--     one-line headline BEFORE the full audit finishes, so the analyzing
--     screen can show a real number in a few seconds instead of a mute
--     spinner for 20-60s (the #1 abandonment driver on the wait).
--   • P1.4 — screenshot cache keyed by URL hash. Re-analyzing the same
--     store re-downloads the already-captured image instead of re-running
--     the slow capture providers (ScreenshotOne → Microlink → mshots).
--
-- Idempotent. No edits to existing migrations.
-- ──────────────────────────────────────────────────────────────────────────

-- ── P1.2 — preview (teaser) score columns ──
alter table public.analyses
  add column if not exists preview_score int,
  add column if not exists preview_summary text;

-- ── P1.4 — screenshot cache (server-only) ──
-- Keyed by a hash of the normalized URL. screenshot_url points at a
-- previously-stored public object in the `screenshots` bucket. If that
-- object is ever deleted the cached URL 404s and the pipeline falls back
-- to a fresh capture (self-healing) — see inngest/functions/analyze-website.ts.
create table if not exists public.screenshot_cache (
  url_hash text primary key,
  url text not null,
  screenshot_url text not null,
  media_type text not null default 'image/jpeg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Writes/reads go exclusively through the service-role client in the
-- Inngest worker. Enable RLS with NO public policies so anon/auth clients
-- can't read it; the service role bypasses RLS.
alter table public.screenshot_cache enable row level security;
