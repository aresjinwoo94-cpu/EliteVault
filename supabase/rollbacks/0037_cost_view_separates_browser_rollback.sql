-- Rollback for 0037_cost_view_separates_browser.sql
--
-- Restores the view exactly as migration 0010 defined it: `calls` counts every
-- usage_events row again, and `browser_seconds` disappears.
--
-- Be aware of what that re-introduces rather than just what it undoes: with
-- Liquid Blocks running, `calls` will again include headless-browser sessions
-- on a page that describes itself as inference cost, so cost-per-call read off
-- it will be wrong. The cost TOTAL stays correct either way.
--
-- Requires dropping first: `create or replace view` cannot remove a column.

drop view if exists public.v_user_cost_30d;

create or replace view public.v_user_cost_30d as
  select
    u.user_id,
    p.email,
    p.plan,
    count(*)                         as calls,
    sum(u.total_tokens)::bigint      as tokens,
    round(sum(u.est_cost_usd), 4)    as cost_usd_30d,
    max(u.created_at)                as last_call_at
  from public.usage_events u
  left join public.profiles p on p.id = u.user_id
  where u.created_at > now() - interval '30 days'
  group by u.user_id, p.email, p.plan
  order by cost_usd_30d desc nulls last;
