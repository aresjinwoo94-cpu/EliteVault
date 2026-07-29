-- ══════════════════════════════════════════════════════════════════════════
-- EliteVault — 0019 Reviews · authenticated-user link
--
-- ADDITIVE extension of the existing `reviews` table (0016). Adds the fields
-- needed for SIGNED-IN users to leave a review tied to their account, with
-- explicit publish consent and optional store attribution. Nothing existing is
-- dropped or renamed — the owner-controlled testimonial flow keeps working.
--
--   • user_id        — author (auth.users). NULL for legacy/anon submissions.
--   • consent_public — must be true to appear on the public site.
--   • store_name/url — optional store attribution shown on the card.
--   • status gains 'rejected' (alongside pending/approved/hidden).
--
-- One active review per authenticated user (partial unique index — anon rows
-- with NULL user_id are unconstrained). Reversible: see rollbacks/0019.
--
-- Idempotent: safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.reviews
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Default TRUE so existing approved testimonials (submitted to be shown) keep
-- displaying; the signed-in form still REQUIRES an explicit consent checkbox
-- server-side before it will insert.
alter table public.reviews
  add column if not exists consent_public boolean not null default true;

alter table public.reviews
  add column if not exists store_name text;

alter table public.reviews
  add column if not exists store_url text;

-- One review per authenticated user (edit-in-place). Anonymous rows (NULL
-- user_id) are not constrained.
create unique index if not exists reviews_user_id_key
  on public.reviews(user_id)
  where user_id is not null;

-- Helps the "my review" lookup on the submission page.
create index if not exists reviews_user_status_idx
  on public.reviews(user_id, status);

-- Allow a 'rejected' status alongside the existing set.
alter table public.reviews drop constraint if exists reviews_status_check;
alter table public.reviews
  add constraint reviews_status_check
  check (status in ('pending', 'approved', 'hidden', 'rejected'));

-- reviews stays service-role-only (RLS enabled, no policies) — every read and
-- write goes through server code, which enforces per-user ownership.
