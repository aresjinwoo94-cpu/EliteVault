-- Rollback for 0034_analysis_timings.sql
--
-- Safe at any time: the column holds diagnostics only, and the single writer
-- (persistAnalysisTimings in lib/analyzer/timings.ts) logs and swallows the
-- missing-column error, so audits keep saving normally after the drop.

alter table public.analyses
  drop column if exists timings;
