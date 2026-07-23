-- ─────────────────────────────────────────────────────────────────────────
-- 0017 — Library expansion (FASE A)
--
-- PURELY ADDITIVE. Every statement is `add column if not exists` / `create
-- index if not exists`. Nothing is renamed, dropped or retyped, so every
-- existing read path (Library grid, /winning-shopify-stores/[niche], image
-- search, the analyzer's niche module) keeps working untouched.
--
-- Rollback: supabase/migrations/0017_library_expansion_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. New per-store columns ─────────────────────────────────────────────
-- All nullable (or defaulted) so existing rows stay valid without a rewrite.
alter table public.winning_sites
  -- Taxonomy
  add column if not exists sub_niche text,
  -- Presentation
  add column if not exists favicon_url text,
  -- Signals (precomputed by the jobs — never fetched per user request)
  add column if not exists internal_score numeric,
  add column if not exists active_ads_count integer,
  add column if not exists ads_last_checked_at timestamptz,
  add column if not exists est_revenue_low numeric,
  add column if not exists est_revenue_high numeric,
  add column if not exists est_conv_rate numeric,
  add column if not exists momentum_score numeric,
  -- Liveness / provenance / publication workflow
  add column if not exists is_live boolean not null default true,
  add column if not exists last_verified_at timestamptz,
  add column if not exists source text,
  add column if not exists status text not null default 'draft';

-- Publication workflow: draft → review → published.
-- The analyzer module reads ONLY `published`.
do $$
begin
  alter table public.winning_sites
    add constraint winning_sites_status_check
    check (status in ('draft', 'review', 'published'));
exception
  when duplicate_object then null;
  when check_violation then
    raise notice 'winning_sites.status holds values outside draft/review/published — constraint skipped';
end $$;

-- Existing rows are the hand-curated seed set (seed-library-v2 / add-curated-*)
-- and are already live in the product. They must stay visible, so they are
-- published as-is. Only rows created FROM NOW ON start as draft.
update public.winning_sites
   set status = 'published'
 where status = 'draft';

-- ── 2. Normalized domain + dedup ─────────────────────────────────────────
-- `domain` has been written by several scripts over time, so it can hold
-- "WWW.Foo.com/" and "foo.com" as two rows. A single normalized column with a
-- unique index is what makes upserts idempotent from here on.
alter table public.winning_sites
  add column if not exists domain_key text;

-- Backfill: lowercase, strip protocol, leading www., path and trailing dots.
-- Mirrors normalizeDomain() in lib/library/domain.ts — keep the two in sync.
update public.winning_sites
   set domain_key = regexp_replace(
         regexp_replace(
           regexp_replace(lower(coalesce(domain, url)), '^https?://', ''),
           '^www\.', ''
         ),
         '[/?#].*$', ''
       )
 where domain_key is null;

-- Trailing dot (FQDN form) — cheap second pass, keeps the regex above readable.
update public.winning_sites
   set domain_key = rtrim(domain_key, '.')
 where domain_key like '%.';

-- The unique index is the real dedup guarantee. If legacy duplicates exist it
-- CANNOT be created — we report them instead of failing the migration, so the
-- deploy never breaks on dirty seed data. `npm run library:audit` lists them.
do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select domain_key
      from public.winning_sites
     where domain_key is not null
     group by domain_key
    having count(*) > 1
  ) d;

  if dupes > 0 then
    raise notice
      'winning_sites: % duplicated domain_key value(s) — unique index NOT created. Run `npm run library:audit` and re-run this migration.',
      dupes;
  else
    create unique index if not exists winning_sites_domain_key_uidx
      on public.winning_sites(domain_key)
      where domain_key is not null;
  end if;
end $$;

-- ── 3. Indexes for the module's read path ────────────────────────────────
-- The analyzer runs: where status='published' and is_live and niche in (...)
-- order by momentum_score desc. This composite index answers it directly.
create index if not exists winning_sites_module_idx
  on public.winning_sites(niche, status, is_live, momentum_score desc);

-- Job scheduling: "which published rows were verified least recently".
create index if not exists winning_sites_verify_idx
  on public.winning_sites(status, last_verified_at nulls first);

-- Review queue.
create index if not exists winning_sites_status_idx
  on public.winning_sites(status);
