-- Rollback for 0039: remove the column-protection triggers (restores the open 0001/0003/0005 behaviour).
drop trigger if exists profiles_protect_columns on public.profiles;
drop trigger if exists analyses_protect_columns on public.analyses;
drop trigger if exists analyses_protect_insert on public.analyses;
drop trigger if exists meta_simulations_protect_update on public.meta_simulations;
drop trigger if exists meta_simulations_protect_insert on public.meta_simulations;
drop trigger if exists api_keys_protect_update on public.api_keys;
drop function if exists public.tg_protect_profiles_columns();
drop function if exists public.tg_protect_analyses_columns();
drop function if exists public.tg_block_client_insert();
drop function if exists public.tg_protect_meta_simulations_update();
drop function if exists public.tg_protect_meta_simulations_insert();
drop function if exists public.tg_protect_api_keys_update();
drop policy if exists "analyses: insert own" on public.analyses;
create policy "analyses: insert own" on public.analyses for insert with check (auth.uid() = user_id);
