-- ──────────────────────────────────────────────────────────────────────────
-- 0023 — Anonymous (pre-login) audit + its abuse controls.
--
-- Activation funnel Tarea 1: cold traffic runs ONE audit from the landing
-- without an account, sees the "aha" (score + annotated screenshot), then
-- signs up to keep the report. To store that audit BEFORE a user exists we:
--
--   • Make analyses.user_id NULLABLE. An anonymous audit has no owner yet.
--     Every existing row keeps its owner; the FK + on-delete-cascade are
--     unchanged. RLS is untouched: the read/insert/update policies all key on
--     `auth.uid() = user_id`, so a null-owner row is invisible to every logged
--     -in user (auth.uid() is never null there). Anonymous rows are read and
--     written EXCLUSIVELY via the service-role client on dedicated server
--     routes (same trust model as the Inngest pipeline), gated by a signed,
--     httpOnly session cookie — never through RLS.
--
--   • anon_id — the opaque, unguessable session token (from the httpOnly
--     cookie) that ties an anonymous audit to the browser that ran it, so only
--     its creator can view it and so we can re-parent it to the account on
--     sign-up. Cleared (set null) once claimed.
--
--   • anon_ip_hash — a salted hash of the client IP, for the per-IP-per-day
--     rate limit (the anon audit is a real AI cost). We store a HASH, never the
--     raw IP, so this stays privacy-preserving. The limit is enforced in app
--     code (lib/anon/rate-limit.ts) by counting recent anonymous rows.
--
-- Fully reversible and additive. No new tables, no RLS changes.
-- ──────────────────────────────────────────────────────────────────────────

-- The owner is now optional (anonymous audits have none until claimed).
alter table public.analyses
  alter column user_id drop not null;

alter table public.analyses
  add column if not exists anon_id text;

alter table public.analyses
  add column if not exists anon_ip_hash text;

comment on column public.analyses.anon_id is
  'Anonymous session token (from the signed httpOnly cookie) for a pre-login audit. Only its creating browser can view the audit; cleared to null once the audit is claimed by an account on sign-up. Null for normal owned audits.';

comment on column public.analyses.anon_ip_hash is
  'Salted hash of the client IP for the anonymous-audit per-IP-per-day rate limit. Never the raw IP. Null for owned audits.';

-- Fast claim lookup: re-parent every audit for a given anon session on sign-up.
create index if not exists analyses_anon_id_idx
  on public.analyses (anon_id)
  where anon_id is not null;

-- Fast rate-limit lookup: count an IP's anonymous audits in the last 24h.
create index if not exists analyses_anon_ip_created_idx
  on public.analyses (anon_ip_hash, created_at desc)
  where anon_ip_hash is not null;
