-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK for 0017_library_expansion.sql
--
-- Run ONLY to undo 0017. It drops exactly what 0017 added and touches nothing
-- that existed before it, so the Library, the SEO niche pages and the analyzer
-- fall back to their pre-0017 behaviour (the niche module already degrades to
-- the legacy column set — see lib/library/niche-winners.ts).
--
--   npm run db:migrate -- supabase/rollbacks/0017_library_expansion_rollback.sql
--
-- It deliberately lives OUTSIDE supabase/migrations/ so the no-arg
-- `npm run db:migrate` can never pick it up and revert 0017 on a deploy.
-- ─────────────────────────────────────────────────────────────────────────

drop index if exists public.winning_sites_module_idx;
drop index if exists public.winning_sites_verify_idx;
drop index if exists public.winning_sites_status_idx;
drop index if exists public.winning_sites_domain_key_uidx;

alter table public.winning_sites
  drop constraint if exists winning_sites_status_check;

alter table public.winning_sites
  drop column if exists sub_niche,
  drop column if exists favicon_url,
  drop column if exists internal_score,
  drop column if exists active_ads_count,
  drop column if exists ads_last_checked_at,
  drop column if exists est_revenue_low,
  drop column if exists est_revenue_high,
  drop column if exists est_conv_rate,
  drop column if exists momentum_score,
  drop column if exists is_live,
  drop column if exists last_verified_at,
  drop column if exists source,
  drop column if exists status,
  drop column if exists domain_key;
