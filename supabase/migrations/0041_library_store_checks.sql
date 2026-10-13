-- 0041 — Library: stored store-verification evidence (WP-L2, brief oct-2026 §L.5). Additive, idempotent.
--
--  • store_checks: the evidence lib/library/store-check.ts produces from the store's home
--    (Shopify signals, brand match, catalogue, niche fit…). The weekly job re-reads a home only when
--    this is missing or older than 90 days, and a store that merely answers 403 to our fetch KEEPS the
--    evidence it already has instead of being demoted.
--  • shopify_verified: generated from store_checks so the card can select it as a plain column.
--    "Shopify" is a WARNING, not a gate: a missing badge never blocks publication.
--  • curated_override: the owner vouches for a store the automatic checks cannot verify (subscription /
--    guided-sale stores with no /products catalogue: sundaysfordogs, thefarmersdog…). The gate then skips
--    ONLY the "no product catalogue" check (never reachability, brand, app-likeness or image), and the row
--    counts as "curated" for ordering. Set by the owner/Code, never by a job.
alter table public.winning_sites
  add column if not exists store_checks jsonb,
  add column if not exists store_checked_at timestamptz,
  add column if not exists curated_override boolean not null default false;

alter table public.winning_sites
  add column if not exists shopify_verified boolean
  generated always as (coalesce((store_checks->>'shopify')::boolean, false)) stored;
