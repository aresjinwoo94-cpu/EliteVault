-- Rollback for 0033_shared_audit_v2.sql
-- Restores the get_shared_audit function to its 0008 definition (the original
-- score-based whitelist, without the report-v2 fields). Non-destructive: no data
-- is touched, only the function body reverts.

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
