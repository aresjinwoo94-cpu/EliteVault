-- ──────────────────────────────────────────────────────────────────────────
-- v4 — Public shareable audits (P0.3: organic growth engine + social proof)
--
-- Goal: every completed audit gets an optional public, read-only link
-- ("my store scored X/100") plus a dynamic OG image, so users share their
-- result and their audience clicks through to "Audit your store free".
--
-- Design choices (all to keep this SAFE and minimal):
--   • We do NOT open a broad public RLS policy on `analyses` (that table
--     holds private audits for every user). Instead we add an opt-in
--     `share_slug` column and expose ONLY the free "diagnosis" fields via
--     a SECURITY DEFINER RPC. The cure (top_fixes, persona) is never
--     returned — consistent with "give the diagnosis, charge for the cure".
--   • Decoupled from Community publishing (which is Pro-gated and curates
--     the leaderboard). Sharing is available on ANY plan and never touches
--     community_analyses.
--   • Idempotent: safe to run more than once.
-- ──────────────────────────────────────────────────────────────────────────

-- Opt-in public share columns on the user's private audit row.
alter table public.analyses
  add column if not exists share_slug text,
  add column if not exists shared_at timestamptz;

-- Unique slug (only enforced for shared rows).
create unique index if not exists analyses_share_slug_idx
  on public.analyses(share_slug)
  where share_slug is not null;

-- ── Public read RPC ────────────────────────────────────────────────────────
-- Returns ONLY the public-safe diagnosis fields for a shared, succeeded
-- audit. SECURITY DEFINER so anon can read the whitelisted columns of a
-- single row without us widening RLS on the whole table. Returns NULL when
-- the slug doesn't resolve to a shared+succeeded audit.
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
    'created_at', a.created_at
  )
  from public.analyses a
  where a.share_slug = p_slug
    and a.status = 'succeeded'
    and a.result is not null
  limit 1;
$$;

grant execute on function public.get_shared_audit(text) to anon, authenticated;
