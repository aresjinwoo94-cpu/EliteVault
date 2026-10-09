-- ──────────────────────────────────────────────────────────────────────────
-- 0036 — Fix Tracks (docs/store-audit-fix-tracks-premium.md §3).
--
-- Per-analysis cache of the on-demand "fix tracks" (post_purchase,
-- theme_colors, competitor) plus the ONE free/anonymous choice:
--   { "<track>": { "fixes": [...], "meta": {...}, "generated_at": "..." }
--                | { "pending_at": "..." },
--     "free_choice": "<track>" | null }
--
-- Three tiny SQL functions make the two rules that must hold under
-- double-clicks / two tabs ATOMIC (a read-then-write in the route can't):
--   • fix_tracks_choose  — set free_choice only if still unset, return the winner.
--   • fix_tracks_claim   — claim the right to generate a track (one AI call),
--                          stale or failed claims (> 30 s, which doubles as the retry cool-down) can be re-claimed.
--   • fix_tracks_store   — write the finished track / clear a failed claim.
-- Service-role only (revoked from anon/authenticated).
--
-- Additive + idempotent. Rollback: supabase/rollbacks/0036_fix_tracks_rollback.sql
-- ──────────────────────────────────────────────────────────────────────────

alter table public.analyses
  add column if not exists fix_tracks jsonb;

comment on column public.analyses.fix_tracks is
  '0036: cached Fix Tracks + free_choice. Written only through the fix_tracks_* functions.';

create or replace function public.fix_tracks_choose(p_id uuid, p_track text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_choice text;
begin
  update public.analyses
     set fix_tracks = coalesce(fix_tracks, '{}'::jsonb) || jsonb_build_object('free_choice', p_track)
   where id = p_id
     and (fix_tracks is null or fix_tracks->>'free_choice' is null);
  select fix_tracks->>'free_choice' into v_choice from public.analyses where id = p_id;
  return v_choice;
end;
$$;

create or replace function public.fix_tracks_claim(p_id uuid, p_track text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.analyses
     set fix_tracks = coalesce(fix_tracks, '{}'::jsonb)
                      || jsonb_build_object(p_track, jsonb_build_object('pending_at', now()))
   where id = p_id
     and (
       fix_tracks is null
       or fix_tracks->p_track is null
       or (
         fix_tracks->p_track->'fixes' is null
         and (fix_tracks->p_track->>'pending_at')::timestamptz < now() - interval '30 seconds'
       )
     );
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- p_value null clears a failed claim (only if it is still just a claim).
create or replace function public.fix_tracks_store(p_id uuid, p_track text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is null then
    update public.analyses
       set fix_tracks = fix_tracks - p_track
     where id = p_id and fix_tracks->p_track->'fixes' is null;
  else
    update public.analyses
       set fix_tracks = coalesce(fix_tracks, '{}'::jsonb) || jsonb_build_object(p_track, p_value)
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.fix_tracks_choose(uuid, text) from public, anon, authenticated;
revoke all on function public.fix_tracks_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.fix_tracks_store(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fix_tracks_choose(uuid, text) to service_role;
grant execute on function public.fix_tracks_claim(uuid, text) to service_role;
grant execute on function public.fix_tracks_store(uuid, text, jsonb) to service_role;
