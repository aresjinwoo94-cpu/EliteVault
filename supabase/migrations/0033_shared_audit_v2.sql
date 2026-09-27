-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0033 shared-audit RPC v2 (report-v2 parity)
--
-- The public /s/[slug] page used to show "scored X/100", which contradicts the
-- V2 report (no score shown). This widens get_shared_audit so the shared page
-- can render the SAME hero as the report: the ad-readiness verdict in words,
-- the $ revenue-potential band, "Why this potential", and the leak radar.
--
-- SAFE / additive by design:
--   • Keeps EVERY key the old RPC returned (score, summary, category_scores,
--     annotations, screenshot_url, created_at) so an already-deployed page keeps
--     working while the new one rolls out. `score` stays because the band is
--     DERIVED from it in code (computePlacement) — the page just never shows it.
--   • ADDS only public-safe, aggregate fields: the verdict, the blocker/fix
--     COUNTS (not their contents), potential_why (qualitative, cites no numbers),
--     and the capture-blocked flag.
--   • Never exposes top_fixes, their titles, or buyer_persona_response — those
--     stay the paid part ("diagnosis free, charge for the cure").
--   • Same SECURITY DEFINER + grant. Idempotent (create or replace).
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.get_shared_audit(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'url', a.url,
    'score', a.result->'score',
    'summary', a.result->>'summary',
    'screenshot_url', a.screenshot_url,
    'category_scores', a.result->'category_scores',
    'annotations', a.result->'annotations',
    'created_at', a.created_at,
    -- report-v2 parity (all public-safe):
    'ad_readiness_verdict', a.result->'ad_readiness'->>'verdict',
    'blocker_count', coalesce(
      case when jsonb_typeof(a.result->'ad_readiness'->'blockers') = 'array'
           then jsonb_array_length(a.result->'ad_readiness'->'blockers') end, 0),
    'fix_count', coalesce(
      case when jsonb_typeof(a.result->'top_fixes') = 'array'
           then jsonb_array_length(a.result->'top_fixes') end, 0),
    'potential_why', a.result->'potential_why',
    'capture_blocked', a.result->'capture_blocked'->'detected'
  )
  from public.analyses a
  where a.share_slug = p_slug
    and a.status = 'succeeded'
    and a.result is not null
  limit 1;
$$;

grant execute on function public.get_shared_audit(text) to anon, authenticated;
