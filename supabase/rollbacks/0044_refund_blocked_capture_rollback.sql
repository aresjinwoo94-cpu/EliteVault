-- Rollback for 0044: back to the 0042 refund_analysis (a blocked-capture run is no longer refunded).
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

revoke all on function public.refund_analysis(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_analysis(uuid, text) to service_role;
