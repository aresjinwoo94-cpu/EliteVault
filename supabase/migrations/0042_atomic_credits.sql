-- 0042 — atomic, idempotent audit credits (§R P0, docs/analyzer-reliability-REPORT-2026-10.md §4).
--
-- Before: every charge/refund was `credits = <value read earlier> ± 1`, so two concurrent audits could
-- lose or duplicate a credit, and an audit could be refunded twice (the 8-minute poller AND Inngest's
-- onFailure, or two polls at once). After:
--   • charging creates the audit and debits ONE credit in a single transaction
--     (`create_charged_analysis`; `credits - 1 where credits >= 1`, never negative);
--   • `refund_analysis` flips queued|running|failed → refunded exactly once (row lock + `refunded_at is null`)
--     and credits back ONLY what the ledger shows was charged, whoever calls it (onFailure, poller, API);
--   • `credit_events` is the ledger: one `charge` and one `refund` per audit, enforced by UNIQUE indexes, so
--     a double refund is impossible even if a function were bypassed;
--   • a run that finishes AFTER it was refunded keeps both report and credit (owner decision 2026-10-13); the
--     trigger flags it (`succeeded_after_refund` + a ledger row) so it can be counted.
-- Additive and idempotent. Rollback: supabase/rollbacks/0042_atomic_credits_rollback.sql

create table if not exists public.credit_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  analysis_id   uuid references public.analyses(id) on delete set null,
  kind          text not null check (kind in ('charge', 'refund', 'succeeded_after_refund')),
  delta         int  not null,
  balance_after int,
  reason        text,
  created_at    timestamptz not null default now()
);
create unique index if not exists credit_events_one_charge_uidx
  on public.credit_events (analysis_id) where kind = 'charge';
create unique index if not exists credit_events_one_refund_uidx
  on public.credit_events (analysis_id) where kind = 'refund';
create unique index if not exists credit_events_one_saf_uidx
  on public.credit_events (analysis_id) where kind = 'succeeded_after_refund';
create index if not exists credit_events_user_idx on public.credit_events (user_id, created_at desc);
alter table public.credit_events enable row level security;  -- no policies: only the service role reads/writes
revoke all on public.credit_events from anon, authenticated;

-- Audits created BEFORE the ledger have no `charge` row; they are treated as charged (see refund_analysis).
create table if not exists public.credit_ledger_meta (
  id boolean primary key default true check (id),
  started_at timestamptz not null default now()
);
insert into public.credit_ledger_meta (id) values (true) on conflict (id) do nothing;
alter table public.credit_ledger_meta enable row level security;
revoke all on public.credit_ledger_meta from anon, authenticated;

alter table public.analyses
  add column if not exists refunded_at timestamptz,
  add column if not exists succeeded_after_refund boolean not null default false;

-- ── charge + create, atomically ────────────────────────────────────────────────────────────────
create or replace function public.create_charged_analysis(
  p_user uuid,
  p_url text,
  p_screenshot_url text,
  p_persona jsonb,
  p_cost int default 1
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits int;
  v_id uuid;
begin
  if p_cost is null or p_cost < 1 then
    raise exception 'create_charged_analysis: p_cost must be >= 1';
  end if;
  update public.profiles
     set credits = credits - p_cost
   where id = p_user and credits >= p_cost
  returning credits into v_credits;
  if not found then
    return null;  -- not enough credits (or no such user): nothing was charged
  end if;

  insert into public.analyses (user_id, url, screenshot_url, buyer_persona, status, credits_charged)
  values (p_user, p_url, p_screenshot_url, p_persona, 'queued', p_cost)
  returning id into v_id;

  insert into public.credit_events (user_id, analysis_id, kind, delta, balance_after)
  values (p_user, v_id, 'charge', -p_cost, v_credits);
  return v_id;
end $$;

-- ── refund, exactly once ──────────────────────────────────────────────────────────────────────
create or replace function public.refund_analysis(p_analysis uuid, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_cost int;
  v_created timestamptz;
  v_credits int;
begin
  -- The single transition. Concurrent callers queue on the row lock; the second one finds
  -- refunded_at set (or status already refunded/succeeded) and gets `false`.
  update public.analyses
     set status = 'refunded',
         error = coalesce(p_error, error),
         finished_at = coalesce(finished_at, now()),
         refunded_at = now()
   where id = p_analysis
     and status in ('queued', 'running', 'failed')
     and refunded_at is null
  returning user_id, credits_charged, created_at into v_user, v_cost, v_created;
  if not found then
    return false;
  end if;

  -- Anonymous audits charge nothing. Owned audits are credited back ONLY if the ledger shows a charge
  -- (or the audit pre-dates the ledger): an anonymous audit claimed by an account mid-run was never charged.
  if v_user is not null and coalesce(v_cost, 0) > 0
     and (exists (select 1 from public.credit_events where analysis_id = p_analysis and kind = 'charge')
          or v_created < (select started_at from public.credit_ledger_meta where id)) then
    update public.profiles set credits = credits + v_cost where id = v_user returning credits into v_credits;
    insert into public.credit_events (user_id, analysis_id, kind, delta, balance_after, reason)
    values (v_user, p_analysis, 'refund', v_cost, v_credits, left(p_error, 200))
    on conflict do nothing;
  end if;
  return true;
end $$;

-- ── a refunded run that finishes keeps report AND credit: record it so it can be counted ───────────
create or replace function public.tg_analysis_succeeded_after_refund()
returns trigger
language plpgsql
as $$
begin
  -- keyed on refunded_at (not only on the old status): a retried step may have moved the row refunded → running
  if old.refunded_at is not null and old.status <> 'succeeded' and new.status = 'succeeded' then
    new.succeeded_after_refund := true;
    if old.user_id is not null then
      insert into public.credit_events (user_id, analysis_id, kind, delta, reason)
      values (old.user_id, old.id, 'succeeded_after_refund', 0, 'run finished after it was refunded; the user keeps report and credit')
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists analyses_succeeded_after_refund on public.analyses;
create trigger analyses_succeeded_after_refund before update on public.analyses
  for each row execute function public.tg_analysis_succeeded_after_refund();

revoke all on function public.create_charged_analysis(uuid, text, text, jsonb, int) from public, anon, authenticated;
revoke all on function public.refund_analysis(uuid, text) from public, anon, authenticated;
grant execute on function public.create_charged_analysis(uuid, text, text, jsonb, int) to service_role;
grant execute on function public.refund_analysis(uuid, text) to service_role;
