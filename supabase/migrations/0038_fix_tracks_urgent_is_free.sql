-- ──────────────────────────────────────────────────────────────────────────
-- 0038 — "urgent" no longer spends the free choice (owner decision 2026-10-11).
--
-- Its fixes ship with the audit and cost no AI, so free/anonymous viewers always see them;
-- the single free pick now applies only to post_purchase / theme_colors / competitor.
-- A row that already stored free_choice = 'urgent' (a pick made under the old rule) must
-- therefore count as "nothing spent yet": fix_tracks_choose may overwrite it, and it
-- never stores 'urgent' again. Everything else (atomic first-writer-wins) is unchanged.
--
-- Idempotent (create or replace). Rollback: supabase/rollbacks/0038_fix_tracks_urgent_is_free_rollback.sql
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.fix_tracks_choose(p_id uuid, p_track text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_choice text;
begin
  if p_track = 'urgent' then
    return null;
  end if;

  update public.analyses
     set fix_tracks = coalesce(fix_tracks, '{}'::jsonb) || jsonb_build_object('free_choice', p_track)
   where id = p_id
     and (
       fix_tracks is null
       or fix_tracks->>'free_choice' is null
       or fix_tracks->>'free_choice' = 'urgent'
     );
  select nullif(fix_tracks->>'free_choice', 'urgent') into v_choice from public.analyses where id = p_id;
  return v_choice;
end;
$$;

revoke all on function public.fix_tracks_choose(uuid, text) from public, anon, authenticated;
grant execute on function public.fix_tracks_choose(uuid, text) to service_role;
