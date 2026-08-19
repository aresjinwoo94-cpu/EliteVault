-- Rollback for 0031_discovery_cache.sql
--
-- Safe at any time: the table holds only re-derivable page content, and every
-- read/write in lib/discovery-cache.ts swallows its own errors. Dropping it
-- puts the pipeline back on a fresh discoverSite() fetch per audit — slower on
-- re-audits, identical in output.
--
-- To disable the cache WITHOUT dropping the table, set
-- DISCOVERY_CACHE_TTL_MINUTES=0 (no deploy needed).

drop index if exists public.discovery_cache_updated_at_idx;
drop table if exists public.discovery_cache;
