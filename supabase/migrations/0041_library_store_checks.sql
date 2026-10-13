-- 0041 — Library: stored store-verification evidence (WP-L2, brief oct-2026 §L.5). Additive, idempotent.
--
--  • store_checks: the evidence lib/library/store-check.ts produces from the store's home
--    (Shopify signals, brand match, catalogue, niche fit…). The weekly job re-reads a home only when
--    this is missing or older than 90 days, and a store that merely answers 403 to our fetch KEEPS the
--    evidence it already has instead of being demoted.
--  • shopify_verified: generated from store_checks so the card can select it as a plain column.
--    "Shopify" is a WARNING, not a gate: a missing badge never blocks publication.
alter table public.winning_sites
  add column if not exists store_checks jsonb,
  add column if not exists store_checked_at timestamptz;

alter table public.winning_sites
  add column if not exists shopify_verified boolean
  generated always as (coalesce((store_checks->>'shopify')::boolean, false)) stored;
