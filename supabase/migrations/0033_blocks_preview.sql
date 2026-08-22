-- ──────────────────────────────────────────────────────────────────────────
-- Liquid Blocks WP-B — where the before/after preview lives.
--
-- Additive columns on blocks_projects (0032). Separate migration rather than an
-- edit to 0032 because migrations are append-only here: 0032 may already have
-- been applied by the time this lands, and a runner that replays a changed file
-- has no way to notice the difference.
--
-- Both URLs point into the existing public `screenshots` bucket (0002) under a
-- `blocks/` prefix, so this reuses the Analyzer's storage rather than
-- provisioning a second bucket with a second set of policies to keep in sync.
-- The paths are keyed by project UUID, which is unguessable; that's the same
-- exposure the Analyzer's screenshots already have.
--
-- No RLS changes: the owner-only policies from 0032 cover these columns, and
-- the Inngest worker writes through the service client which bypasses RLS.
--
-- Idempotent; rollback in supabase/rollbacks/0033_blocks_preview_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.blocks_projects
  -- The page as it stands today.
  add column if not exists preview_before_url text,
  -- The same page, same scroll position, with the block in place. The block is
  -- inserted AFTER its anchor so nothing above it moves, which is what makes
  -- the pair a genuine comparison instead of two differently-shifted pages.
  add column if not exists preview_after_url text;
