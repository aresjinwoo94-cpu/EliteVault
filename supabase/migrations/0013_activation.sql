-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0013 Activation (Phase 5, kill early churn)
--
-- Track time-to-first-value (TTFV) and gate the activation follow-up email.
-- Purely ADDITIVE: two nullable columns on profiles. No data is touched and
-- existing behaviour is unchanged. Idempotent.
--
--   first_value_at        — when the user got their FIRST successful audit.
--                           TTFV = first_value_at - created_at.
--   activation_emailed_at — when we sent the activation follow-up (so the
--                           scheduled job sends it at most once).
-- ──────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists first_value_at timestamptz;

alter table public.profiles
  add column if not exists activation_emailed_at timestamptz;

comment on column public.profiles.first_value_at is
  'First successful audit timestamp. Time-to-first-value = first_value_at - created_at.';
comment on column public.profiles.activation_emailed_at is
  'When the activation follow-up email was sent (sent at most once).';
