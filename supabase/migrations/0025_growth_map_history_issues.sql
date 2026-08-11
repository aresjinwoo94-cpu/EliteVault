-- ──────────────────────────────────────────────────────────────────────────
-- 0025 — Growth Map history: per-run issue snapshots (master brief §D).
--
-- Additive only. One jsonb column on the existing growth_map_history table so a
-- LATER run of the same store can diff issues against the previous run and show
-- "what changed since {date}" — resolved / still-open / newly-introduced. The
-- snapshot is a tiny array of { fingerprint, title, severity } written at Growth
-- Map build time (service role), read back (service role only) to compute the
-- diff shown in the map header.
--
-- Touches nothing else: no analyzer scoring, no changes to analyses, no RLS
-- changes (the table already has RLS enabled with no client policies — service
-- role only, exactly like 0024). Existing rows keep issues = NULL and simply
-- produce an empty diff (score-only movement), so there is zero regression.
-- Fully reversible — see rollbacks/0025_growth_map_history_issues_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.growth_map_history
  add column if not exists issues jsonb;
