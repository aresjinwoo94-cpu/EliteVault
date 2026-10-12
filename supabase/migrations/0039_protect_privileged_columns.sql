-- 0039 — close the self-service privilege-escalation hole (WP-0, brief oct-2026 §2).
--
-- 0001 created "profiles: update own" / "analyses: update own" with NO column
-- restriction, and `authenticated` holds UPDATE on both tables. Anyone logged
-- in could run, from the browser with the public anon key:
--   supabase.from("profiles").update({ plan: "scale", credits: 9999 }).eq("id", me)
-- (verified against production on 2026-10-11 inside a rolled-back transaction).
--
-- Fix: a BEFORE UPDATE trigger that, for the client roles (`anon` /
-- `authenticated`), rejects any change outside an explicit ALLOWLIST of columns.
-- An allowlist (not a denylist) so a column added in a future migration is
-- protected by default. The service role / postgres (webhook, Inngest, server
-- actions using the service client) are untouched: the check keys off
-- current_user, which a client cannot spoof.
--
-- A trigger rather than REVOKE UPDATE + column grants because it does not
-- change privileges the app may rely on elsewhere, and it fails loudly.
-- Idempotent. Rollback: supabase/rollbacks/0039_protect_privileged_columns_rollback.sql

create or replace function public.tg_protect_profiles_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    -- Columns a signed-in user may legitimately change on their own profile.
    if (to_jsonb(new) - array['full_name', 'avatar_url', 'onboarded', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['full_name', 'avatar_url', 'onboarded', 'updated_at']) then
      raise exception 'profiles: this column can only be changed by the server'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns before update on public.profiles
  for each row execute function public.tg_protect_profiles_columns();

create or replace function public.tg_protect_analyses_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    -- Only the share link may be set from the user's own session
    -- (app/actions/share.ts). Everything else — status, result, fix_tracks,
    -- niche_winners, meta_ads, user_id/anon_id, is_published, credits_charged,
    -- timings, … — is written by the server.
    if (to_jsonb(new) - array['share_slug', 'shared_at'])
       is distinct from
       (to_jsonb(old) - array['share_slug', 'shared_at']) then
      raise exception 'analyses: this column can only be changed by the server'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists analyses_protect_columns on public.analyses;
create trigger analyses_protect_columns before update on public.analyses
  for each row execute function public.tg_protect_analyses_columns();

-- A user may only INSERT a fresh, queued, empty audit for themselves
-- (app/actions/analyzer.ts). Nothing pre-filled with results or entitlements.
create or replace function public.tg_protect_analyses_insert()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.status is distinct from 'queued'
       or new.result is not null
       or new.rewrite is not null
       or new.meta_ads is not null
       or new.fix_tracks is not null
       or new.niche_winners is not null
       or new.is_published is true
       or new.share_slug is not null then
      raise exception 'analyses: a new audit must start queued and empty'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists analyses_protect_insert on public.analyses;
create trigger analyses_protect_insert before insert on public.analyses
  for each row execute function public.tg_protect_analyses_insert();
