-- ──────────────────────────────────────────────────────────────────────────
-- Liquid Blocks WP-C — the chosen block, and the merchant's corrections.
--
-- Additive columns on blocks_projects (0032). Append-only, like 0033: by the
-- time this lands the earlier files may already have been applied, and a runner
-- replaying a CHANGED file has no way to notice the difference.
--
-- block_spec        The block the merchant picked, with the claims they typed.
--                   Every catalogue block carries claims, and none of them is
--                   ever autofilled — validated by lib/blocks/catalog.ts before
--                   it gets here, so a row either holds a complete spec or none
--                   at all. Null means they're still on the calibration preview.
--
-- token_overrides   Design tokens the merchant corrected, as
--                   {"palette.accent": "#ff5a00"}. Deliberately stored SEPARATE
--                   from design_tokens rather than merged into it: keeping the
--                   measurement and the correction apart is what lets the UI
--                   keep saying which is which, and lets a re-measure update
--                   what we read without silently discarding what they told us.
--
-- No RLS changes — 0032's owner-only policies already cover these columns.
--
-- Idempotent; rollback in supabase/rollbacks/0034_blocks_catalog_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.blocks_projects
  add column if not exists block_spec jsonb,
  add column if not exists token_overrides jsonb;
