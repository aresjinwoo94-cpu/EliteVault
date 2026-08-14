-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK for 0027_playbook.sql
--
-- Run ONLY to undo 0027. It drops exactly what 0027 added (the status +
-- forward-compat columns, the status check constraint and the update policy)
-- and touches nothing that existed before it, so saved_sites falls back to its
-- pre-0027 shape (a plain bookmark). The Playbook tab already degrades to the
-- legacy "Saved" behaviour when status is absent.
--
--   npm run db:migrate -- supabase/rollbacks/0027_playbook_rollback.sql
--
-- Lives OUTSIDE supabase/migrations/ so the no-arg `npm run db:migrate` can
-- never pick it up and revert 0027 on a deploy.
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "saved_sites: update own" on public.saved_sites;

alter table public.saved_sites drop constraint if exists saved_sites_status_check;
alter table public.saved_sites
  drop column if exists status,
  drop column if exists source_analysis_id,
  drop column if exists issue_fingerprint,
  drop column if exists updated_at;
