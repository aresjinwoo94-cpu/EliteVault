-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK for 0029_review_stats.sql
--
-- Run ONLY to undo 0029. It drops exactly the five columns 0029 added and
-- touches nothing that existed before it, so reviews / review_settings fall
-- back to their pre-0029 shape. The app degrades cleanly: with the columns
-- absent, getReviewSettings fails closed (public section hidden) — the same
-- documented behaviour as before these columns existed.
--
--   npm run db:migrate -- supabase/rollbacks/0029_review_stats_rollback.sql
--
-- Lives OUTSIDE supabase/migrations/ so the no-arg `npm run db:migrate` can
-- never pick it up and revert 0029 on a deploy.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.review_settings
  drop column if exists show_review_stats;

alter table public.reviews
  drop column if exists audits_run,
  drop column if exists potential_snapshot,
  drop column if exists verified,
  drop column if exists verified_at;
