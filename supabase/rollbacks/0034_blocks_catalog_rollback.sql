-- Rollback for 0034_blocks_catalog.sql
--
-- Drops the chosen block and the merchant's token corrections. The projects,
-- their product data, their measured design tokens and their preview images all
-- survive — a project reverts to the calibration preview it started as.
--
-- What is genuinely lost: the claims the merchant typed (shipping times,
-- warranty terms, comparison rows). Those came from them and cannot be
-- re-derived, so this is the one rollback in the feature that destroys work
-- rather than caching. Export the column first if that matters:
--   select id, block_spec, token_overrides from public.blocks_projects
--   where block_spec is not null;

alter table public.blocks_projects
  drop column if exists token_overrides,
  drop column if exists block_spec;
