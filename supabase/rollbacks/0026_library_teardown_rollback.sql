-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK for 0026_library_teardown.sql
--
-- Run ONLY to undo 0026. It drops exactly what 0026 added (the teardown
-- column + its partial index) and touches nothing that existed before it, so
-- the Library falls back to its pre-0026 behaviour (the "Cómo convierte"
-- button already degrades to hidden when teardown is null — see site-card.tsx).
--
--   npm run db:migrate -- supabase/rollbacks/0026_library_teardown_rollback.sql
--
-- Lives OUTSIDE supabase/migrations/ so the no-arg `npm run db:migrate` can
-- never pick it up and revert 0026 on a deploy.
-- ─────────────────────────────────────────────────────────────────────────

drop index if exists public.winning_sites_has_teardown_idx;
alter table public.winning_sites drop column if exists teardown;
