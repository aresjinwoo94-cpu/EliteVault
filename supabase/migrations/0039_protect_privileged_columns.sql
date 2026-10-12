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

-- Audits are created by the server (app/actions/analyzer.ts uses the service
-- client): a user inserting their own analyses row could set credits_charged
-- huge and then collect the refund the stale-run path pays out
-- (app/api/analyses/[id]/route.ts), or pre-fill result/fix_tracks. No client
-- role may insert; the policy goes too.
create or replace function public.tg_block_client_insert()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception '%: rows are created by the server', tg_table_name
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists analyses_protect_insert on public.analyses;
create trigger analyses_protect_insert before insert on public.analyses
  for each row execute function public.tg_block_client_insert();
drop policy if exists "analyses: insert own" on public.analyses;

-- meta_simulations: the monthly projection quota counts rows in
-- queued/running/succeeded (lib/quota/guard.ts). With "sim: update own" a Pro
-- user could flip a finished run to 'failed' and run again forever. Every
-- write after the insert is done by the server (Inngest / service client).
create or replace function public.tg_protect_meta_simulations_update()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'meta_simulations: rows are updated by the server only'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists meta_simulations_protect_update on public.meta_simulations;
create trigger meta_simulations_protect_update before update on public.meta_simulations
  for each row execute function public.tg_protect_meta_simulations_update();

-- A user may still START a run (app/actions/meta-simulator.ts) but only as a
-- fresh queued row with no results or error.
create or replace function public.tg_protect_meta_simulations_insert()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.status is distinct from 'queued'
       or new.conservative is not null or new.balanced is not null
       or new.aggressive is not null or new.error is not null then
      raise exception 'meta_simulations: a new run must start queued and empty'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists meta_simulations_protect_insert on public.meta_simulations;
create trigger meta_simulations_protect_insert before insert on public.meta_simulations
  for each row execute function public.tg_protect_meta_simulations_insert();

-- api_keys: the owner may revoke a key (app/actions/api-keys.ts) and nothing
-- else — not un-revoke it, not edit its hash / counters.
create or replace function public.tg_protect_api_keys_update()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if (to_jsonb(new) - array['revoked_at']) is distinct from (to_jsonb(old) - array['revoked_at'])
       or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
      raise exception 'api_keys: a key can only be revoked'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists api_keys_protect_update on public.api_keys;
create trigger api_keys_protect_update before update on public.api_keys
  for each row execute function public.tg_protect_api_keys_update();
