-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0046 claim a public audit (/s/[slug]) + manual re-audit
-- Design: docs/design-share-claim-unlock-reaudit.md (approved by the owner: D1–D6).
--
-- CLAIM = transfer of analyses.user_id to the claimant, gated by a single-use token that the owner
-- generates when he copies the outreach message. Everything keyed on analyses.user_id (report, polling,
-- Fix Tracks, the $7 unlock and its settlement) then works unchanged for the claimant.
--
--   analysis_claim_tokens  one row per issued token (hash only; the token itself lives only in the message).
--                          Several tokens per audit are allowed (the owner may copy the message twice);
--                          claiming consumes the audit's tokens all at once.
--   analysis_claims        log of every transfer (auditable and reversible by the owner).
--   analyses.reaudit_of    set by the server on a manual re-audit: the audit it refreshes.
--
-- All three are server-only: RLS on and no policy; EXECUTE on the RPCs is limited to service_role.
-- Idempotent.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.analyses add column if not exists reaudit_of uuid references public.analyses(id) on delete set null;

create table if not exists public.analysis_claim_tokens (
  token_hash  text primary key,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  claimed_by  uuid references public.profiles(id) on delete set null
);
create index if not exists analysis_claim_tokens_analysis_idx on public.analysis_claim_tokens (analysis_id);
alter table public.analysis_claim_tokens enable row level security;
revoke all on public.analysis_claim_tokens from anon, authenticated;

create table if not exists public.analysis_claims (
  id                 bigint generated always as identity primary key,
  analysis_id        uuid not null references public.analyses(id) on delete cascade,
  from_user_id       uuid references public.profiles(id) on delete set null,
  to_user_id         uuid not null references public.profiles(id) on delete cascade,
  email_domain_match boolean not null default false,
  claimed_at         timestamptz not null default now(),
  reverted_at        timestamptz
);
create index if not exists analysis_claims_to_user_idx on public.analysis_claims (to_user_id, claimed_at desc);
create index if not exists analysis_claims_analysis_idx on public.analysis_claims (analysis_id);
alter table public.analysis_claims enable row level security;
revoke all on public.analysis_claims from anon, authenticated;

-- ── claim_shared_audit ───────────────────────────────────────────────────
-- One transaction: validate the token, enforce 3 claims a day per user, transfer ownership, consume the tokens.
-- Errors (message): not_found | invalid_or_used | already_owner | rate_limited
create or replace function public.claim_shared_audit(
  p_slug text, p_token_hash text, p_user uuid, p_domain_match boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a record;
  v_ok boolean;
  v_recent int;
begin
  select id, user_id into v_a
    from public.analyses
   where share_slug = p_slug and status = 'succeeded' and result is not null
   for update;
  if not found then raise exception 'not_found'; end if;

  select exists (
    select 1 from public.analysis_claim_tokens
     where token_hash = p_token_hash and analysis_id = v_a.id and claimed_at is null
  ) into v_ok;
  if not v_ok then raise exception 'invalid_or_used'; end if;

  if v_a.user_id is not distinct from p_user then raise exception 'already_owner'; end if;

  select count(*) into v_recent
    from public.analysis_claims
   where to_user_id = p_user and reverted_at is null and claimed_at > now() - interval '1 day';
  if v_recent >= 3 then raise exception 'rate_limited'; end if;

  update public.analyses
     set user_id = p_user,
         -- without a matching email domain the audit goes back to "unlisted"; the owner may flag it later
         share_indexable = case when p_domain_match then share_indexable else false end
   where id = v_a.id;
  -- an unlock row cannot exist for the original owner, but keep it consistent if it ever does
  update public.analysis_unlocks set user_id = p_user where analysis_id = v_a.id;

  update public.analysis_claim_tokens
     set claimed_at = now(), claimed_by = p_user
   where analysis_id = v_a.id and claimed_at is null;

  insert into public.analysis_claims (analysis_id, from_user_id, to_user_id, email_domain_match)
  values (v_a.id, v_a.user_id, p_user, coalesce(p_domain_match, false));

  return v_a.id;
end;
$$;

-- ── revert_claim ─────────────────────────────────────────────────────────
-- Owner-only (called with the service role): give the audit back, unless a $7 unlock was paid on it.
-- Errors: no_claim | has_paid_unlock
create or replace function public.revert_claim(p_analysis uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_c record;
begin
  select id, from_user_id into v_c
    from public.analysis_claims
   where analysis_id = p_analysis and reverted_at is null
   order by claimed_at desc limit 1
   for update;
  if not found or v_c.from_user_id is null then raise exception 'no_claim'; end if;

  if exists (select 1 from public.analysis_unlocks where analysis_id = p_analysis and status = 'paid') then
    raise exception 'has_paid_unlock';
  end if;

  update public.analyses set user_id = v_c.from_user_id, share_indexable = false where id = p_analysis;
  update public.analysis_claims set reverted_at = now() where id = v_c.id;
  -- the consumed tokens are dead; new ones are issued when the owner copies the message again
  delete from public.analysis_claim_tokens where analysis_id = p_analysis;
end;
$$;

-- ── repoint_share ────────────────────────────────────────────────────────
-- Manual re-audit, step 2: move the public link (slug, note, indexing flag, unclaimed tokens) from the old
-- audit to its fresh re-audit. Both must belong to the same user, the new one must be a clean success
-- that says it refreshes the old one, and the old one must not have been claimed.
-- Errors: not_found | not_owner_pair | not_ready | already_claimed
create or replace function public.repoint_share(p_old uuid, p_new uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  n record;
begin
  select id, user_id, share_slug, share_note, share_indexable into o from public.analyses where id = p_old for update;
  select id, user_id, status, result, reaudit_of into n from public.analyses where id = p_new for update;
  if o.id is null or n.id is null or o.share_slug is null then raise exception 'not_found'; end if;
  if o.user_id is distinct from n.user_id or n.reaudit_of is distinct from o.id then raise exception 'not_owner_pair'; end if;
  if n.status <> 'succeeded' or n.result is null or coalesce((n.result->'capture_blocked'->>'detected')::boolean, false) then
    raise exception 'not_ready';
  end if;
  if exists (select 1 from public.analysis_claims where analysis_id = p_old and reverted_at is null) then
    raise exception 'already_claimed';
  end if;

  -- the unique index on share_slug allows one holder: clear the old row first
  update public.analyses set share_slug = null, shared_at = null where id = o.id;
  update public.analyses
     set share_slug = o.share_slug, shared_at = now(), share_note = o.share_note, share_indexable = o.share_indexable
   where id = n.id;
  update public.analysis_claim_tokens set analysis_id = n.id where analysis_id = o.id and claimed_at is null;
  return o.share_slug;
end;
$$;

revoke all on function public.claim_shared_audit(text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.revert_claim(uuid) from public, anon, authenticated;
revoke all on function public.repoint_share(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_shared_audit(text, text, uuid, boolean) to service_role;
grant execute on function public.revert_claim(uuid) to service_role;
grant execute on function public.repoint_share(uuid, uuid) to service_role;
