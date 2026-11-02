-- 0048 — remember the currency a Meta simulation was ENTERED and SHOWN in.
--
-- The engine, the prompts and every stored number stay USD (aov_usd, daily_budget_usd, the 3 scenarios).
-- These two columns only pin how the same numbers are DISPLAYED, so a reload (or another device, or a visit
-- from another country) shows the same figures the user saw when they ran it, instead of re-converting at
-- today's rate. NULL on both = a row from before this change = shown in USD, exactly as before.
--
-- Additive and idempotent. Rollback: supabase/rollbacks/0048_meta_simulations_display_currency_rollback.sql
alter table public.meta_simulations add column if not exists display_currency text;
alter table public.meta_simulations add column if not exists display_fx_rate numeric(18, 8);

do $$ begin
  alter table public.meta_simulations
    add constraint meta_simulations_display_currency_chk
    check (display_currency is null or display_currency ~ '^[A-Z]{3}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.meta_simulations
    add constraint meta_simulations_display_fx_rate_chk
    check (display_fx_rate is null or display_fx_rate > 0);
exception when duplicate_object then null; end $$;
