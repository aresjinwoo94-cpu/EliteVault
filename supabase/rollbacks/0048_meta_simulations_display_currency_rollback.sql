-- Rollback of 0048: drop the display-currency columns (rows fall back to USD display, nothing else depends on them).
alter table public.meta_simulations drop constraint if exists meta_simulations_display_currency_chk;
alter table public.meta_simulations drop constraint if exists meta_simulations_display_fx_rate_chk;
alter table public.meta_simulations drop column if exists display_currency;
alter table public.meta_simulations drop column if exists display_fx_rate;
