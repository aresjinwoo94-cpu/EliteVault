-- ──────────────────────────────────────────────────────────────────────────
-- WP-3 — progressive reveal on the analyzing screen.
--
-- The audit takes ~30-50s of wall clock, and today the user watches a spinner
-- for all of it even though the pipeline knows real things about the store
-- within the first few seconds. The screenshot URL is already persisted by the
-- capture step; this column is the OTHER half — a tiny, display-ready
-- projection of what the discovery step scraped (platform, rating, trust
-- claims, price range, page/review/FAQ counts).
--
-- Written best-effort inside the existing `discover-site` step, so it costs no
-- extra Inngest round-trip, no AI call and no third-party request. See
-- lib/analyzer/discovery-signals.ts for the exact shape and the rule that it
-- only ever reports what discovery actually found.
--
-- Idempotent. No edits to existing migrations.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.analyses
  add column if not exists discovery_signals jsonb;

comment on column public.analyses.discovery_signals is
  'WP-3: compact, display-ready signals from the discovery step, shown while the audit is still running. Never affects the audit result.';
