-- ──────────────────────────────────────────────────────────────────────────
-- Liquid Blocks WP-D — one row per purchased export.
--
-- # Why this is NOT profiles.credits
-- The brief originally specified 10 credits per export. That was overridden by
-- the owner, for two reasons worth writing down so nobody re-introduces it:
--
--   1. Credits are the AUDIT currency. A Free user has one welcome credit and
--      spends it on their audit — so charging the export from that pool locks
--      the download away from exactly the person standing at the moment of
--      highest intent, which is the one moment this feature is designed around.
--   2. On a paid plan it cannibalises. Every export would silently cost the
--      merchant audits they were already paying for.
--
-- So the export is a one-time Stripe purchase, open to anyone regardless of
-- plan, and nothing in this work package reads, writes, or refunds
-- profiles.credits. If exports are ever bundled into Pro/Scale it will be
-- through their own meter — a row count per month, the shape meta_simulations
-- already uses — never from the credit pool.
--
-- # Why a table rather than a boolean on blocks_projects
-- This is a financial record. It has to survive the project being re-previewed,
-- re-composed, or re-exported, and `stripe_session_id` is what makes processing
-- a payment twice impossible — independently of the webhook's own event-level
-- dedupe, which cannot protect against the same session arriving under two
-- different event ids.
--
-- Idempotent; rollback in supabase/rollbacks/0035_blocks_exports_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.blocks_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.blocks_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The idempotency key. Unique, so a replayed webhook, a refreshed return page
  -- and a manual reconciliation all converge on the same row instead of
  -- granting the export twice.
  stripe_session_id text unique,
  status text not null default 'pending',
  -- What they ACTUALLY paid, as Stripe reported it. Recorded rather than read
  -- back from the Price so the trace survives a later price change.
  amount_total integer,
  currency text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.blocks_exports
    add constraint blocks_exports_status_check
    check (status in ('pending', 'paid', 'expired'));
exception
  when duplicate_object then null;
end $$;

-- The only hot read: "has this project been paid for?", on every visit to the
-- project page and before every export.
create index if not exists blocks_exports_project_status_idx
  on public.blocks_exports (project_id, status);

alter table public.blocks_exports enable row level security;

-- Read-only to the owner. Every WRITE goes through the service client, from the
-- webhook or the eager confirmation — a client that could insert its own row
-- with status 'paid' would be the paywall's front door.
drop policy if exists "blocks_exports: select own" on public.blocks_exports;
create policy "blocks_exports: select own"
  on public.blocks_exports for select
  using (auth.uid() = user_id);
