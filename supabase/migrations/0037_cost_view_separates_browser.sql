-- ──────────────────────────────────────────────────────────────────────────
-- Make the internal cost view stop counting browser sessions as AI calls.
--
-- WP-E added the first rows to `usage_events` that are not inference: Liquid
-- Blocks' headless Chromium, written as provider = 'browser'. The view's
-- `count(*)` swept them in, so a page titled "Inference cost per user" and
-- subtitled "Estimated Gemini/Claude COGS" started counting preview runs as
-- model calls. Nothing broke — cost-per-call simply stopped being true, which
-- is the worse failure, because a number that is quietly wrong gets trusted.
--
-- The fix keeps every cost in the total (browser compute IS COGS and belongs
-- there) while separating what each row actually is:
--   calls           — inference calls only, so cost-per-call means something
--   browser_seconds — the headless compute, in the unit it is billed in
--
-- Tokens were never affected: browser rows carry hard zeros, deliberately, so
-- that pretending they had tokens couldn't corrupt the totals.
--
-- Drop + recreate, NOT `create or replace`: browser_seconds sits between
-- tokens and cost_usd_30d, and Postgres refuses to reorder an existing
-- view's columns with replace (error 42P16). `drop ... if exists` keeps it
-- idempotent. Rollback in
-- supabase/rollbacks/0037_cost_view_separates_browser_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

drop view if exists public.v_user_cost_30d;

create view public.v_user_cost_30d as
  select
    u.user_id,
    p.email,
    p.plan,
    -- Inference only. `provider` is free text and has always defaulted to
    -- 'gemini', so anything that isn't explicitly the browser still counts —
    -- a new AI provider is included without touching this view.
    count(*) filter (where u.provider is distinct from 'browser') as calls,
    sum(u.total_tokens)::bigint      as tokens,
    -- Real seconds of headless compute, from the duration WP-E measures. Null
    -- coalesced to 0 so a user with no previews reads 0 rather than blank.
    coalesce(
      round(
        sum(
          case
            when u.provider = 'browser'
            then coalesce((u.meta ->> 'durationMs')::numeric, 0) / 1000
            else 0
          end
        ),
        1
      ),
      0
    ) as browser_seconds,
    -- Unchanged: every cost, inference and browser alike.
    round(sum(u.est_cost_usd), 4)    as cost_usd_30d,
    max(u.created_at)                as last_call_at
  from public.usage_events u
  left join public.profiles p on p.id = u.user_id
  where u.created_at > now() - interval '30 days'
  group by u.user_id, p.email, p.plan
  order by cost_usd_30d desc nulls last;
