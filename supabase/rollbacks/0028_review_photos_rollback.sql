-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK for 0028_review_photos.sql
--
-- Run ONLY to undo 0028. It drops exactly the three columns 0028 added and
-- touches nothing that existed before it, so reviews / review_settings fall
-- back to their pre-0028 shape. The app degrades cleanly: with the columns
-- absent, getReviewSettings fails closed (public section hidden) — the same
-- documented behaviour as before these columns existed.
--
--   npm run db:migrate -- supabase/rollbacks/0028_review_photos_rollback.sql
--
-- Lives OUTSIDE supabase/migrations/ so the no-arg `npm run db:migrate` can
-- never pick it up and revert 0028 on a deploy.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.review_settings drop constraint if exists review_settings_max_photos_check;
alter table public.review_settings
  drop column if exists allow_photos,
  drop column if exists max_photos;

alter table public.reviews
  drop column if exists photos;
