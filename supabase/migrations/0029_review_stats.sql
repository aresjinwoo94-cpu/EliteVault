-- ══════════════════════════════════════════════════════════════════════════
-- EliteVault — 0029 Verified review stats
--
-- ADDITIVE extension of the reviews system (0016 / 0019 / 0028). Nothing
-- existing is dropped or renamed — the whole moderated-testimonial + photos
-- flow keeps working exactly as before.
--
-- These columns hold a SNAPSHOT of a reviewer's real, already-seen numbers so
-- the landing never joins live against analyses/meta_simulations (which would
-- leak other users' data and recompute on every request). The snapshot is
-- filled by an owner-driven server action (refreshReviewStats), the same shape
-- as the owner-driven photo flow — nothing is auto-derived on submit yet.
--
--   • reviews.audits_run        — # of real audits (analyses.status='succeeded')
--                                 run by the author account, at verify time.
--   • reviews.potential_snapshot — jsonb money-potential the analyzer already
--                                 showed that account (never invented). Shape
--                                 is documented in app/actions/reviews.ts
--                                 (PotentialSnapshot).
--   • reviews.verified          — TRUE only when the review is tied to an
--                                 account with real analyses. Default FALSE.
--   • reviews.verified_at       — when the snapshot was last refreshed.
--   • review_settings.show_review_stats — owner master switch: are the
--                                 "verified" badge + money mini-diagram + audit
--                                 count shown publicly? Default OFF — the owner
--                                 turns it on once the real data is reviewed.
--
-- Both tables stay SERVICE-ROLE ONLY (RLS enabled, no policies) — every read
-- and write still goes through server code with the service client.
--
-- DEPLOY ORDER — NON-NEGOTIABLE: apply this migration in Supabase BEFORE
-- deploying the code. lib/reviews/data.ts selects `show_review_stats` (and,
-- when the toggle is on, the three review columns); if the columns don't exist
-- yet the query fails and (by the same fail-closed design as getReviewSettings)
-- the public reviews section hides itself entirely.
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════════════

-- Number of real audits the author account has run, at verify time. NULL until
-- verified (or for reviews with no linked account).
alter table public.reviews
  add column if not exists audits_run int;

-- Money potential the analyzer detected for that account (mini-diagram). Free
-- jsonb; the backend fills it with the SAME numbers the user already saw in
-- their report (never invented). See PotentialSnapshot in app/actions/reviews.ts.
alter table public.reviews
  add column if not exists potential_snapshot jsonb;

-- Only TRUE when the review is tied to an account with real analyses.
alter table public.reviews
  add column if not exists verified boolean not null default false;

-- When the stats snapshot was last refreshed.
alter table public.reviews
  add column if not exists verified_at timestamptz;

-- Owner master switch: show the "verified" badge + money mini-diagram + audit
-- count publicly? Default OFF — the owner enables it once the real data is
-- reviewed.
alter table public.review_settings
  add column if not exists show_review_stats boolean not null default false;
