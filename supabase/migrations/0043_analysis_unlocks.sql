-- 0043 — one-time "unlock this report" purchases (WP-2, brief oct-2026 §4.1). Additive and idempotent.
--
-- A $7 unlock opens the FULL report of ONE audit for a Free user. It is an entitlement per audit, not a plan:
-- no PlanTier, nothing on `profiles`. It lives in its own table — not in a column of `analyses` — because
-- the owner can update their own analyses row; only the service role writes here (webhook / return page).
--
--  • analysis_id is the PRIMARY KEY: one unlock per audit, ever (a second payment for the same audit is
--    refunded automatically by lib/unlocks/settle.ts);
--  • stripe_session_id is UNIQUE: settling the same Checkout Session twice (webhook + return page, retries)
--    is a no-op;
--  • status 'refunded' (charge.refunded) re-locks the report.
create table if not exists public.analysis_unlocks (
  analysis_id           uuid primary key references public.analyses(id) on delete cascade,
  user_id               uuid not null references public.profiles(id) on delete cascade,
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  amount_total          integer,   -- in the currency charged (Adaptive Pricing may not be USD)
  currency              text,
  status                text not null default 'paid' check (status in ('paid', 'refunded')),
  created_at            timestamptz not null default now(),
  refunded_at           timestamptz
);
create index if not exists analysis_unlocks_user_idx on public.analysis_unlocks (user_id);
create index if not exists analysis_unlocks_pi_idx on public.analysis_unlocks (stripe_payment_intent);

alter table public.analysis_unlocks enable row level security;
-- The buyer may READ their own unlocks (so the UI can show "unlocked"); nobody but the service role writes.
drop policy if exists "unlocks: read own" on public.analysis_unlocks;
create policy "unlocks: read own" on public.analysis_unlocks for select using (auth.uid() = user_id);
revoke insert, update, delete on public.analysis_unlocks from anon, authenticated;
