-- Rollback for 0035_blocks_exports.sql
--
-- DESTRUCTIVE IN A WAY THE OTHER ROLLBACKS ARE NOT: this table is the record of
-- what customers paid for. Dropping it does not refund anyone, it just makes us
-- forget — every merchant who bought an export would be asked to buy it again,
-- and there would be no local trace to reconcile against.
--
-- Stripe still holds the truth (each Checkout Session carries
-- `blocks_project_id` in its metadata), so the table can be rebuilt from the
-- Stripe dashboard or API if it comes to that. Do that BEFORE running this.
--
-- To stop selling exports WITHOUT dropping anything, unset
-- STRIPE_PRICE_LIQUID_EXPORT — the UI then degrades honestly and no checkout
-- can be started. That is almost always the change you actually want.

drop policy if exists "blocks_exports: select own" on public.blocks_exports;
drop index if exists public.blocks_exports_project_status_idx;
drop table if exists public.blocks_exports;
