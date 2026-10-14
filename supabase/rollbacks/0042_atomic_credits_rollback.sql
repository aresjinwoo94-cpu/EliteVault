-- Rollback for 0042 (the app code must be rolled back FIRST: it calls these functions).
drop trigger if exists analyses_succeeded_after_refund on public.analyses;
drop function if exists public.tg_analysis_succeeded_after_refund();
drop function if exists public.refund_analysis(uuid, text);
drop function if exists public.create_charged_analysis(uuid, text, text, jsonb, int);
alter table public.analyses drop column if exists succeeded_after_refund;
alter table public.analyses drop column if exists refunded_at;
drop table if exists public.credit_ledger_meta;
drop table if exists public.credit_events;
