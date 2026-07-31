-- Rollback for 0021_growth_map.sql — drops the additive Growth Map cache column.
-- Safe: the column is pure enrichment; dropping it cannot affect any audit.
alter table public.analyses
  drop column if exists growth_map;
