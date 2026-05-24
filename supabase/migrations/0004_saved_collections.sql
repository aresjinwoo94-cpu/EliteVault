-- ──────────────────────────────────────────────────────────────────────────
-- v2.3 — Saved Collections
--
-- Pro/Scale users can star winning sites into a private "saved" list.
-- Lightweight: one row per (user, site). Toggle is delete-or-insert.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.saved_sites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid not null references public.winning_sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, site_id)
);

create index if not exists saved_sites_user_idx
  on public.saved_sites(user_id, created_at desc);

alter table public.saved_sites enable row level security;

drop policy if exists "saved_sites: read own" on public.saved_sites;
create policy "saved_sites: read own"
  on public.saved_sites for select
  using (auth.uid() = user_id);

drop policy if exists "saved_sites: insert own" on public.saved_sites;
create policy "saved_sites: insert own"
  on public.saved_sites for insert
  with check (auth.uid() = user_id);

drop policy if exists "saved_sites: delete own" on public.saved_sites;
create policy "saved_sites: delete own"
  on public.saved_sites for delete
  using (auth.uid() = user_id);

-- ── Bump Free-tier preview cap from 8 → 9 ───────────────────────────────
-- 9 fills a clean 3×3 grid on lg screens. We rotate by featured + age.
do $$
declare
  preset_count int;
begin
  -- Reset and reapply if count is wrong
  select count(*) into preset_count from public.winning_sites where is_preselected;
  if preset_count != 9 then
    update public.winning_sites set is_preselected = false where is_preselected;
    update public.winning_sites
       set is_preselected = true
     where id in (
       select id from public.winning_sites
       order by is_featured desc, created_at asc
       limit 9
     );
  end if;
end $$;
