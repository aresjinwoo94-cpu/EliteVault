-- ──────────────────────────────────────────────────────────────────────────
-- 0034 — per-audit timings (docs/analyzer-speed-fix-free-tier.md §5.2).
--
-- Until now the only latency signal was finished_at - created_at, which can't
-- say where the time went (capture? the vision call? a step retry?) or which
-- model answered. save-result now writes a small jsonb next to the result:
--   { v, captureMs, captureCached, visionMs, saveMs, totalMs, model,
--     attempts: { vision }, hedged, fellBackFrom, modelSwitched }
-- read by scripts/analyzer-latency-report.mjs.
--
-- Written in a SEPARATE best-effort update after the audit is already marked
-- succeeded (lib/analyzer/timings.ts), so an un-migrated database only loses
-- the diagnostics row, never the audit.
--
-- Additive + idempotent. Rollback: supabase/rollbacks/0034_analysis_timings_rollback.sql
-- ──────────────────────────────────────────────────────────────────────────

alter table public.analyses
  add column if not exists timings jsonb;

comment on column public.analyses.timings is
  '0034: per-audit timings (capture/vision/save ms, model, attempts). Diagnostics only; never affects the audit result.';
