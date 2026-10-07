-- ══════════════════════════════════════════════════════════════════════════
-- EliteVault — 0035 Owner monitor v2 (docs/owner-monitor-v2.md)
--
--   • owner_settings          key/value (metrics_reset_at)
--   • visitors                one row per ev_anon visitor, FIRST-TOUCH channel
--   • page_views / sessions   + channel, utm_*, landing_path
--   • profiles                + acq_* (acquisition channel copied at sign-up)
--   • checkout_followups      persisted "Marcar seguimiento" in "Casi pagan"
--   • ov_* functions          aggregations in SQL (no limit(10000) in JS)
--
-- Service-role only: RLS on, no policies, functions revoked from public.
-- Idempotent. Rollback: supabase/rollbacks/0035_owner_monitor_v2_rollback.sql
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.owner_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table public.owner_settings enable row level security;

create table if not exists public.visitors (
  anon_id               text primary key,
  first_seen_at         timestamptz not null default now(),
  first_channel         text,
  first_referrer_domain text,
  first_landing_path    text,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  country               text,
  device                text,
  user_id               uuid references auth.users(id) on delete set null
);
alter table public.visitors enable row level security;
create index if not exists visitors_first_seen_idx on public.visitors (first_seen_at desc);
create index if not exists visitors_channel_idx    on public.visitors (first_channel);
create index if not exists visitors_user_idx       on public.visitors (user_id) where user_id is not null;

alter table public.page_views
  add column if not exists channel text;
create index if not exists page_views_channel_idx on public.page_views (channel, created_at desc);

alter table public.sessions
  add column if not exists channel text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists landing_path text;
create index if not exists sessions_started_idx on public.sessions (started_at desc);
create index if not exists sessions_channel_idx on public.sessions (channel, started_at desc);

alter table public.profiles
  add column if not exists acq_channel text,
  add column if not exists acq_referrer_domain text,
  add column if not exists acq_utm_campaign text,
  add column if not exists acq_landing_path text;
create index if not exists profiles_acq_channel_idx on public.profiles (acq_channel);

create table if not exists public.checkout_followups (
  session_id text primary key,
  created_at timestamptz not null default now()
);
alter table public.checkout_followups enable row level security;

create index if not exists analyses_created_idx on public.analyses (created_at desc);

-- ── Aggregations ──────────────────────────────────────────────────────────
-- Every function counts real traffic only (page_views never holds internal
-- hits) and takes a half-open window [p_from, p_to).

create or replace function public.ov_visits(p_from timestamptz, p_to timestamptz)
returns bigint language sql stable security definer set search_path = public as $$
  select count(distinct anon_id) from public.page_views
  where created_at >= p_from and created_at < p_to;
$$;

create or replace function public.ov_channels(p_from timestamptz, p_to timestamptz)
returns table (channel text, visitors bigint) language sql stable security definer set search_path = public as $$
  select coalesce(pv.channel, 'Directo'), count(distinct pv.anon_id)
  from public.page_views pv
  where pv.created_at >= p_from and pv.created_at < p_to
  group by 1 order by 2 desc;
$$;

create or replace function public.ov_devices(p_from timestamptz, p_to timestamptz)
returns table (device text, visitors bigint) language sql stable security definer set search_path = public as $$
  select coalesce(pv.device, 'Desconocido'), count(distinct pv.anon_id)
  from public.page_views pv
  where pv.created_at >= p_from and pv.created_at < p_to
  group by 1 order by 2 desc;
$$;

create or replace function public.ov_visitor_countries(p_from timestamptz, p_to timestamptz)
returns table (country text, visitors bigint) language sql stable security definer set search_path = public as $$
  select pv.country, count(distinct pv.anon_id)
  from public.page_views pv
  where pv.created_at >= p_from and pv.created_at < p_to
  group by 1 order by 2 desc limit 30;
$$;

-- Of the visitors seen in the window, how many had already been seen before it.
create or replace function public.ov_new_vs_returning(p_from timestamptz, p_to timestamptz)
returns table (new_visitors bigint, returning_visitors bigint) language sql stable security definer set search_path = public as $$
  with cur as (
    select distinct anon_id from public.page_views
    where created_at >= p_from and created_at < p_to
  )
  select
    count(*) filter (where not exists (
      select 1 from public.page_views o where o.anon_id = cur.anon_id and o.created_at < p_from)),
    count(*) filter (where exists (
      select 1 from public.page_views o where o.anon_id = cur.anon_id and o.created_at < p_from))
  from cur;
$$;

-- Entry pages: first-touch landing of each session that started in the window.
create or replace function public.ov_landing_pages(p_from timestamptz, p_to timestamptz, p_limit int default 10)
returns table (path text, visitors bigint, top_channel text) language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce(landing_path, sessions.path, '/') as lp, anon_id, coalesce(channel, 'Directo') as ch
    from public.sessions
    where not is_internal and started_at >= p_from and started_at < p_to
  ), top as (
    select distinct on (lp) lp, ch from (
      select lp, ch, count(*) n from s group by lp, ch
    ) t order by lp, n desc
  )
  select s.lp, count(distinct s.anon_id), top.ch
  from s join top on top.lp = s.lp
  group by s.lp, top.ch order by 2 desc limit p_limit;
$$;

-- Campaigns: first-touch visitors that arrived with a utm_campaign.
create or replace function public.ov_campaigns(p_from timestamptz, p_to timestamptz)
returns table (campaign text, channel text, visitors bigint, signups bigint) language sql stable security definer set search_path = public as $$
  select utm_campaign, coalesce(first_channel, 'Directo'), count(*), count(user_id)
  from public.visitors
  where utm_campaign is not null and first_seen_at >= p_from and first_seen_at < p_to
  group by 1, 2 order by 3 desc limit 30;
$$;

-- Channels → money (visitors + signups; revenue is joined in code from Stripe).
create or replace function public.ov_channel_funnel(p_from timestamptz, p_to timestamptz)
returns table (channel text, visitors bigint, signups bigint) language sql stable security definer set search_path = public as $$
  with v as (
    select coalesce(first_channel, 'Directo') ch, count(*) n from public.visitors
    where first_seen_at >= p_from and first_seen_at < p_to group by 1
  ), s as (
    select coalesce(acq_channel, 'Sin atribuir') ch, count(*) n from public.profiles
    where created_at >= p_from and created_at < p_to group by 1
  )
  select coalesce(v.ch, s.ch), coalesce(v.n, 0), coalesce(s.n, 0)
  from v full outer join s on s.ch = v.ch order by 2 desc, 3 desc;
$$;

-- Distinct users with ≥1 audit (anonymous audits, user_id null, are excluded).
create or replace function public.ov_audit_users(p_from timestamptz, p_to timestamptz)
returns bigint language sql stable security definer set search_path = public as $$
  select count(distinct user_id) from public.analyses
  where user_id is not null and created_at >= p_from and created_at < p_to;
$$;

-- Fixed-width buckets (hours/days; Guayaquil has no DST so widths are uniform).
-- Rows are filtered to [p_from, p_to); the bucket grid starts at p_origin so a
-- window clamped by the reset keeps the same grid as the chart.
create or replace function public.ov_bucket_counts(
  p_table text, p_from timestamptz, p_to timestamptz, p_origin timestamptz, p_step_seconds int, p_points int, p_valid_only boolean default false)
returns table (idx int, n bigint) language plpgsql stable security definer set search_path = public as $$
begin
  if p_table = 'subscriptions' then
    return query
      select least(p_points - 1, greatest(0, floor(extract(epoch from (s.created_at - p_origin)) / p_step_seconds)::int)) as i, count(*)
      from public.subscriptions s
      where s.created_at >= p_from and s.created_at < p_to
        and (not p_valid_only or s.status in ('active','trialing','past_due'))
      group by i;
  elsif p_table = 'profiles' then
    return query
      select least(p_points - 1, greatest(0, floor(extract(epoch from (s.created_at - p_origin)) / p_step_seconds)::int)) as i, count(*)
      from public.profiles s
      where s.created_at >= p_from and s.created_at < p_to
      group by i;
  else
    raise exception 'unsupported table %', p_table;
  end if;
end $$;

-- Analyzer health: per local day (America/Guayaquil).
create or replace function public.ov_analyzer_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, with_session bigint, anonymous bigint, succeeded bigint, failed bigint)
language sql stable security definer set search_path = public as $$
  select (created_at at time zone 'America/Guayaquil')::date,
    count(*) filter (where user_id is not null),
    count(*) filter (where user_id is null),
    count(*) filter (where status = 'succeeded'),
    count(*) filter (where status in ('failed','refunded'))
  from public.analyses
  where created_at >= p_from and created_at < p_to
  group by 1 order by 1;
$$;

create or replace function public.ov_analyzer_latency(p_from timestamptz, p_to timestamptz)
returns table (samples bigint, p50_ms numeric, p95_ms numeric)
language sql stable security definer set search_path = public as $$
  select count(t), percentile_cont(0.5) within group (order by t), percentile_cont(0.95) within group (order by t)
  from (
    select (timings->>'totalMs')::numeric t from public.analyses
    where created_at >= p_from and created_at < p_to
      and timings is not null and (timings->>'totalMs') ~ '^[0-9.]+$'
  ) x;
$$;

-- Service role only.
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ov\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
