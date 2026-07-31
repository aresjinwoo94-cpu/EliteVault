-- ──────────────────────────────────────────────────────────────────────────
-- 0021 — EliteVault Growth Map.
--
-- Additive only. Adds a single JSONB column to analyses that caches the
-- per-store Growth Map payload (placement + AI node feedback + diagnosis).
-- Spec §5/§6: compute ONCE per store/analysis, never regenerate on every
-- visit. Same store → same cached copy; different store → different copy.
--
-- Touches nothing else: no analyzer scoring, no RLS changes (the existing
-- "analyses: update own" policy already lets the owner's session read it, and
-- the Inngest/route writes go through the service-role client). Fully
-- reversible — see rollbacks/0021_growth_map_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.analyses
  add column if not exists growth_map jsonb;

comment on column public.analyses.growth_map is
  'EliteVault Growth Map cache (spec 0021): { version, placement, nodes, diagnosis, source, nicheLabel, generatedAt }. Computed once per analysis.';
