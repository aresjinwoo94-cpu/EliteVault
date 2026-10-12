-- 0040 — Library images: provenance, owner protection, and "no real image ⇒ never published"
-- (WP-L1, brief oct-2026 §L.3). Additive and idempotent.
--
-- Diagnosis (docs/library-image-audit-REPORT.md): every card that shows a letter is a row
-- inserted with a live mshots URL (46 rows, 2026-10-10) that the verify job published anyway.
--
--  • thumbnail_source: owner | capture | og_image. The 87 images that already live in our
--    Storage are marked 'owner' (protected).
--  • thumbnail_url may be NULL (no more '' / mshots placeholders).
--  • review_reason: why a row is parked in 'review' (no_image, not_a_store, …).
--  • thumbnail_checked_at / thumbnail_attempts: the low-priority image job rotates on these.
--  • Trigger (cannot be bypassed by any script or job):
--      1. a row without a real image can never be 'published' (coerced to 'review'/no_image);
--      2. an 'owner' image can only be replaced by another 'owner' upload — never cleared or
--         overwritten by a capture/og_image/backfill (incl. `--force`).

alter table public.winning_sites
  add column if not exists thumbnail_source text,
  add column if not exists thumbnail_checked_at timestamptz,
  add column if not exists thumbnail_attempts int not null default 0,
  add column if not exists review_reason text;

do $$ begin
  alter table public.winning_sites
    add constraint winning_sites_thumbnail_source_check
    check (thumbnail_source is null or thumbnail_source in ('owner', 'capture', 'og_image'));
exception when duplicate_object then null; end $$;

alter table public.winning_sites alter column thumbnail_url drop not null;

update public.winning_sites
   set thumbnail_source = 'owner'
 where thumbnail_source is null
   and thumbnail_url like '%/storage/v1/object/public/screenshots/library/%';

create or replace function public.tg_winning_sites_guard()
returns trigger
language plpgsql
as $$
begin
  -- 2. owner images are sacred
  if tg_op = 'UPDATE' and old.thumbnail_source = 'owner'
     and (new.thumbnail_url is distinct from old.thumbnail_url
          or new.thumbnail_source is distinct from old.thumbnail_source)
     and not (new.thumbnail_source = 'owner' and new.thumbnail_url is not null and btrim(new.thumbnail_url) <> '') then
    raise exception 'winning_sites: an owner-uploaded image can only be replaced by another owner upload'
      using errcode = '42501';
  end if;

  -- 1. no real image => never published
  if new.status = 'published'
     and (new.thumbnail_url is null
          or btrim(new.thumbnail_url) = ''
          or new.thumbnail_url !~* '^https?://'
          or new.thumbnail_url ~* 's\.wordpress\.com/mshots') then
    new.status := 'review';
    new.review_reason := coalesce(new.review_reason, 'no_image');
  end if;
  return new;
end $$;

drop trigger if exists winning_sites_guard on public.winning_sites;
create trigger winning_sites_guard before insert or update on public.winning_sites
  for each row execute function public.tg_winning_sites_guard();
