-- ──────────────────────────────────────────────────────────────────────────
-- 0022 — Real niche matching for the analyzer's "Winners in your niche".
--
-- Additive only. Adds two columns to `analyses`, both written once by the
-- Inngest pipeline (best-effort, never blocks/refunds an audit):
--   • detected_niche  — the REAL niche inferred from the analyzed screenshot
--                       (via the same vision detector the Library search uses),
--                       replacing the old hostname-as-niche guess.
--   • niche_winners   — the precomputed, per-store ranked winners with a REAL,
--                       variable visual match % (no more fixed 100% trio). The
--                       report page reads this instead of recomputing.
--
-- Touches nothing else: no analyzer scoring, no RLS changes (owner reads via
-- the existing "analyses: select own" policy; the pipeline writes via the
-- service-role client). Fully reversible: `alter table … drop column`.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.analyses
  add column if not exists detected_niche text;

alter table public.analyses
  add column if not exists niche_winners jsonb;

comment on column public.analyses.detected_niche is
  'Real product niche inferred from the analyzed screenshot (tech-fixes §2). Slug from the Library niche taxonomy, or null when undetectable.';

comment on column public.analyses.niche_winners is
  'Precomputed Winners-in-your-niche payload (tech-fixes §2): { niche, nicheLabel, scope, winners:[{ domain, matchPct, ... }] }. Real variable match %, computed once per analysis.';
