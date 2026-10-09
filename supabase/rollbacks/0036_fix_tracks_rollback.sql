-- Rollback for 0036_fix_tracks.sql
-- Safe at any time: the route fails closed (503) when the column/functions are missing,
-- and the report never depends on fix_tracks.
drop function if exists public.fix_tracks_store(uuid, text, jsonb);
drop function if exists public.fix_tracks_claim(uuid, text);
drop function if exists public.fix_tracks_choose(uuid, text);
alter table public.analyses drop column if exists fix_tracks;
