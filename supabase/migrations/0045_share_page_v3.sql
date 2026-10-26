-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0045 public audit page v3 (/s/[slug]): personal note + indexing policy
--
-- Two additive columns on analyses, both written ONLY by the server (service role,
-- behind the owner/admin guard):
--
--   share_note       text   short personal note shown at the top of the shared page
--                           ("Prepared by Ariel for <domain>"). Max 280 chars.
--   share_indexable  bool   default FALSE. Shared audits are NOT indexable by default
--                           (noindex + out of the sitemap): most /s/ pages are outreach
--                           audits of stores that did not ask for one, and thin look-alike
--                           pages hurt the site. The owner flips this to TRUE only for
--                           an audit the store's own owner published or claimed.
--
-- Users cannot write them: migration 0039's analyses trigger only lets
-- anon/authenticated update share_slug and shared_at, so any new column is
-- server-only without further work.
--
-- get_shared_audit gains two public-safe fields (every existing key is kept, so a
-- deployed page keeps working while the new one rolls out): share_note and
-- share_indexable. It still never returns top_fixes titles or buyer_persona_response.
--
-- Idempotent.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.analyses add column if not exists share_note text;
alter table public.analyses add column if not exists share_indexable boolean not null default false;

alter table public.analyses drop constraint if exists analyses_share_note_len;
alter table public.analyses add constraint analyses_share_note_len
  check (share_note is null or char_length(share_note) <= 280);

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
    'capture_blocked', a.result->'capture_blocked'->'detected',
    -- v3: personal note + indexing policy (owner-controlled, server-written)
    'share_note', a.share_note,
    'share_indexable', a.share_indexable
  )
  from public.analyses a
  where a.share_slug = p_slug
    and a.status = 'succeeded'
    and a.result is not null
  limit 1;
$$;

grant execute on function public.get_shared_audit(text) to anon, authenticated;
