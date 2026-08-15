-- ══════════════════════════════════════════════════════════════════════════
-- EliteVault — 0028 Review photos
--
-- ADDITIVE extension of the reviews system (0016 / 0019). Nothing existing is
-- dropped or renamed — the whole moderated-testimonial flow keeps working.
--
--   • reviews.photos              — per-review images, jsonb array of
--                                   {url, path}; `path` is the key inside the
--                                   public "screenshots" bucket (prefix
--                                   reviews/) so a photo can be removed from
--                                   storage when it's removed from the review.
--   • review_settings.allow_photos — owner master switch: may signed-in users
--                                    add photos to THEIR OWN review from the
--                                    site? Default OFF — the owner turns it on
--                                    explicitly. Does NOT gate the owner adding
--                                    photos from their panel (always allowed).
--   • review_settings.max_photos   — cap per review, configurable without a
--                                    redeploy (0–10, default 4).
--
-- Both tables stay SERVICE-ROLE ONLY (RLS enabled, no policies) — every read
-- and write still goes through server code with the service client.
--
-- DEPLOY ORDER — NON-NEGOTIABLE: apply this migration in Supabase BEFORE
-- deploying the code. lib/reviews/data.ts selects `photos`, `allow_photos` and
-- `max_photos` explicitly; if the columns don't exist yet the whole query
-- fails and (by the same fail-closed design as getReviewSettings) the public
-- reviews section hides itself entirely.
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════════════

-- Per-review photos. jsonb array of {url, path}; path is the object key in the
-- "screenshots" bucket (prefix reviews/) so it can be deleted on removal.
alter table public.reviews
  add column if not exists photos jsonb not null default '[]'::jsonb;

-- Owner master switch: can users upload photos to their own review from the
-- site? Default OFF — the owner enables it explicitly when they want. Does not
-- affect the owner uploading photos from their panel, which is always allowed.
alter table public.review_settings
  add column if not exists allow_photos boolean not null default false;

-- Per-review photo cap, configurable without a redeploy.
alter table public.review_settings
  add column if not exists max_photos int not null default 4
    check (max_photos between 0 and 10);
