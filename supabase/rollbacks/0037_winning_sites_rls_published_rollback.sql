-- Rollback for 0037: restore the original wide-open read policy (0001_init.sql).
drop policy if exists "sites: published live read" on public.winning_sites;
drop policy if exists "sites: public read" on public.winning_sites;
create policy "sites: public read" on public.winning_sites
  for select using (true);
