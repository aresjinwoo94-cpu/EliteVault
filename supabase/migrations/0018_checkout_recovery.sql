-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0018 Abandoned-checkout recovery (Part 2)
--
-- One row per abandoned subscription checkout session. Drives the recovery
-- email sequence (1h / 24h / 72h) run by inngest/functions/checkout-recovery.
-- Purely ADDITIVE and idempotent. Only the service role (Inngest job +
-- unsubscribe route) reads/writes this — RLS is enabled with NO public
-- policies, exactly like the other system tables.
--
--   emails_sent   — how many steps of the sequence have been sent (0..3).
--                   Doubles as the per-step idempotency guard.
--   status        — 'pending' | 'recovered' | 'unsubscribed'.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.checkout_recovery (
  session_id        text primary key,            -- Stripe Checkout Session id
  user_id           uuid not null references public.profiles(id) on delete cascade,
  email             text not null,
  plan              text not null,               -- 'pro' | 'scale'
  interval          text not null,               -- 'month' | 'year'
  emails_sent       int  not null default 0,
  last_email_at     timestamptz,
  status            text not null default 'pending', -- 'pending' | 'recovered' | 'unsubscribed'
  created_at        timestamptz not null default now(),
  recovered_at      timestamptz
);

create index if not exists checkout_recovery_user_idx
  on public.checkout_recovery (user_id);

-- Only the service role writes here (Inngest/unsubscribe route). RLS on, no
-- public policies — same posture as stripe_events and the other system tables.
alter table public.checkout_recovery enable row level security;

comment on table public.checkout_recovery is
  'Abandoned subscription-checkout recovery sequence state. Service-role only.';
