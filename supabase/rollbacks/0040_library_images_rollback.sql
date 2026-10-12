-- Rollback for 0040. thumbnail_url is NOT re-set to NOT NULL (rows may now hold NULL);
-- run `update public.winning_sites set thumbnail_url = '' where thumbnail_url is null;` first if you must.
drop trigger if exists winning_sites_guard on public.winning_sites;
drop function if exists public.tg_winning_sites_guard();
alter table public.winning_sites drop constraint if exists winning_sites_thumbnail_source_check;
alter table public.winning_sites
  drop column if exists thumbnail_source,
  drop column if exists thumbnail_checked_at,
  drop column if exists thumbnail_attempts,
  drop column if exists review_reason;
