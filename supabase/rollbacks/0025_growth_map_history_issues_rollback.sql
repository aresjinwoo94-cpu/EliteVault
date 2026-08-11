-- Rollback for 0025_growth_map_history_issues.sql — drops the additive column.
-- Safe: `issues` is pure enrichment for the Growth Map "what changed" header;
-- dropping it cannot affect any audit or the map's deterministic placement, and
-- the movement layer degrades to score-only when the column is absent.
alter table public.growth_map_history
  drop column if exists issues;
