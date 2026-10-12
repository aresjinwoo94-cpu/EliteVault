-- Rollback for 0039: remove the column-protection triggers (restores the open 0001 behaviour).
drop trigger if exists profiles_protect_columns on public.profiles;
drop trigger if exists analyses_protect_columns on public.analyses;
drop trigger if exists analyses_protect_insert on public.analyses;
drop function if exists public.tg_protect_profiles_columns();
drop function if exists public.tg_protect_analyses_columns();
drop function if exists public.tg_protect_analyses_insert();
