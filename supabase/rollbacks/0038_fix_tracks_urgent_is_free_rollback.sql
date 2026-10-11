-- Rollback for 0038: restore the 0036 definition of fix_tracks_choose (urgent counts as a pick again).
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
revoke all on function public.fix_tracks_choose(uuid, text) from public, anon, authenticated;
grant execute on function public.fix_tracks_choose(uuid, text) to service_role;
