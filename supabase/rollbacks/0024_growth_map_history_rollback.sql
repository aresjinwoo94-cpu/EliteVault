-- Rollback for 0024_growth_map_history.sql — drops the additive movement table.
-- Safe: the table is pure enrichment for the Growth Map header; dropping it
-- cannot affect any audit or the map's deterministic placement.
drop table if exists public.growth_map_history;
