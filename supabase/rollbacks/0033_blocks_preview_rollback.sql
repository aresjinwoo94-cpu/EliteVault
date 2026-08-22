-- Rollback for 0033_blocks_preview.sql
--
-- Drops only the two preview URL columns; the projects, their product data and
-- their measured design tokens survive. What is lost is the pointer to each
-- pair of images, not the images themselves — those stay in the `screenshots`
-- bucket under `blocks/<project-id>-{before,after}.jpg` and can be re-linked or
-- deleted separately.
--
-- Re-running the preview regenerates both, so this is recoverable work rather
-- than lost data.

alter table public.blocks_projects
  drop column if exists preview_after_url,
  drop column if exists preview_before_url;
