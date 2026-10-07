-- Rollback for 0035_owner_monitor_v2.sql
-- Drops only what 0035 added; existing page_views/sessions rows keep their data.
-- Redeploy the previous app build FIRST: the v2 /api/track and owner panel
-- write/read these objects.

drop function if exists public.ov_visits(timestamptz, timestamptz);
drop function if exists public.ov_channels(timestamptz, timestamptz);
drop function if exists public.ov_devices(timestamptz, timestamptz);
drop function if exists public.ov_visitor_countries(timestamptz, timestamptz);
drop function if exists public.ov_new_vs_returning(timestamptz, timestamptz);
drop function if exists public.ov_landing_pages(timestamptz, timestamptz, int);
drop function if exists public.ov_campaigns(timestamptz, timestamptz);
drop function if exists public.ov_channel_funnel(timestamptz, timestamptz);
drop function if exists public.ov_audit_users(timestamptz, timestamptz);
drop function if exists public.ov_bucket_counts(text, timestamptz, timestamptz, timestamptz, int, int, boolean);
drop function if exists public.ov_analyzer_daily(timestamptz, timestamptz);
drop function if exists public.ov_analyzer_latency(timestamptz, timestamptz);

drop table if exists public.checkout_followups;
drop table if exists public.visitors;
drop table if exists public.owner_settings;

drop index if exists public.analyses_created_idx;
drop index if exists public.profiles_acq_channel_idx;
alter table public.profiles
  drop column if exists acq_channel,
  drop column if exists acq_referrer_domain,
  drop column if exists acq_utm_campaign,
  drop column if exists acq_landing_path;

drop index if exists public.sessions_started_idx;
drop index if exists public.sessions_channel_idx;
alter table public.sessions
  drop column if exists channel,
  drop column if exists utm_source,
  drop column if exists utm_medium,
  drop column if exists utm_campaign,
  drop column if exists landing_path;

drop index if exists public.page_views_channel_idx;
alter table public.page_views drop column if exists channel;
