-- 0044 — a run whose capture was an anti-bot wall (result.capture_blocked.detected) gives the credit back.
--
-- Owner decision 2026-10-16: such an audit "succeeds" technically (it is stored with status = 'succeeded' and the
-- report page shows the "we could not read your store" notice), but the user received nothing useful, so a
-- charged (free-plan) account must not lose the credit.
--
-- It extends refund_analysis (same single entry point, same exactly-once guarantees) with ONE extra case:
--   status = 'succeeded' AND result.capture_blocked.detected = true AND refunded_at is null
-- For that case the row KEEPS status 'succeeded' (the notice must keep rendering; nothing is demoted) and gets
-- refunded_at; the credit goes back only if the ledger shows a charge, and credit_events' UNIQUE refund index
-- makes a second refund impossible. Every other succeeded audit is still never refunded. Anonymous audits
-- charge nothing (no credit movement). Everything else in the function is unchanged from 0042.
-- Additive: create or replace. Rollback: supabase/rollbacks/0044_refund_blocked_capture_rollback.sql

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
    -- The one extra case: a finished run that only captured an anti-bot wall. Status stays 'succeeded'.
    update public.analyses
       set refunded_at = now()
     where id = p_analysis
       and status = 'succeeded'
       and refunded_at is null
       and (result -> 'capture_blocked' ->> 'detected') = 'true'
    returning user_id, credits_charged, created_at into v_user, v_cost, v_created;
    if not found then
      return false;
    end if;
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

revoke all on function public.refund_analysis(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_analysis(uuid, text) to service_role;
