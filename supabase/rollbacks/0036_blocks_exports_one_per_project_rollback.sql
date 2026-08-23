-- Rollback for 0036_blocks_exports_one_per_project.sql
--
-- Drops the constraint that stops a project being paid for twice. Nothing is
-- lost, but the double-charge race described in the migration's header becomes
-- possible again — the application-level check in `startExportCheckout` is a
-- read, not a guarantee.
--
-- Only worth running if the index itself is causing a problem (e.g. a
-- deliberate decision to allow repeat purchases per project).

drop index if exists public.blocks_exports_one_paid_per_project_idx;
