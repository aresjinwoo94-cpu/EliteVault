-- Rollback for 0019_reviews_user_link.sql — reverses the authenticated-user
-- extension of public.reviews. Safe to run; leaves the original 0016 schema.

-- Restore the original status check (drop 'rejected').
alter table public.reviews drop constraint if exists reviews_status_check;
-- Fold any 'rejected' rows back to 'hidden' so the restored check passes.
update public.reviews set status = 'hidden' where status = 'rejected';
alter table public.reviews
  add constraint reviews_status_check
  check (status in ('pending', 'approved', 'hidden'));

drop index if exists public.reviews_user_status_idx;
drop index if exists public.reviews_user_id_key;

alter table public.reviews drop column if exists store_url;
alter table public.reviews drop column if exists store_name;
alter table public.reviews drop column if exists consent_public;
alter table public.reviews drop column if exists user_id;
