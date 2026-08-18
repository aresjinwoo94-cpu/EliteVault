-- Rollback for 0030_analysis_discovery_signals.sql
--
-- Safe to run at any time: the column is additive and purely presentational
-- (it feeds the waiting screen, never the audit result). Dropping it makes the
-- analyzing screen fall back to the screenshot + spinner it showed before WP-3;
-- the pipeline itself is unaffected because every write to it is best-effort.

alter table public.analyses
  drop column if exists discovery_signals;
