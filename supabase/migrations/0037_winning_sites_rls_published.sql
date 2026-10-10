-- ──────────────────────────────────────────────────────────────────────────
-- 0037 — winning_sites: only published AND live rows are readable by the app/API keys
-- (docs/premium-audit-REPORT.md H1; owner decision 2026-10-09).
--
-- Until now the policy was `using (true)`: with the public anon key anyone could
-- read EVERY row, including 17 `review` stores that failed the publication gate and
-- storefronts known to be dead — and the paid Library listed them. The application
-- code now filters `status = 'published' and is_live` too (defence in depth); this
-- makes the database enforce it.
--
-- The service role (admin tools, scripts/library/*, the analyzer pipeline) bypasses
-- RLS, so discover → verify → momentum keep seeing drafts/review rows.
--
-- Idempotent. Rollback: supabase/rollbacks/0037_winning_sites_rls_published_rollback.sql
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "sites: public read" on public.winning_sites;
drop policy if exists "sites: published live read" on public.winning_sites;
create policy "sites: published live read" on public.winning_sites
  for select to anon, authenticated
  using (status = 'published' and is_live = true);
