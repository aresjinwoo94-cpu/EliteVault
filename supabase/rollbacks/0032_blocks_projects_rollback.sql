-- Rollback for 0032_blocks_projects.sql
--
-- Destructive in the ordinary sense — it drops the user's Liquid Blocks
-- projects — but nothing outside the feature reads this table, so removing it
-- cannot affect the Analyzer, billing, or any existing report.
--
-- What is actually lost: the persisted product payload and design tokens for
-- each project. Both are re-derivable by re-running the preview from the same
-- product URL, so the cost is a re-run, not unrecoverable data.
--
-- To disable the feature WITHOUT dropping anything, unlink /app/liquid from the
-- navigation (components/dashboard/nav-items.ts) — no deploy of this file
-- required.

drop policy if exists "blocks_projects: delete own" on public.blocks_projects;
drop policy if exists "blocks_projects: update own" on public.blocks_projects;
drop policy if exists "blocks_projects: insert own" on public.blocks_projects;
drop policy if exists "blocks_projects: select own" on public.blocks_projects;
drop index if exists public.blocks_projects_user_created_idx;
drop table if exists public.blocks_projects;
