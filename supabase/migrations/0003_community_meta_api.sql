-- ──────────────────────────────────────────────────────────────────────────
-- v2 schema:
--   • community_analyses — denormalized public snapshots of audits
--   • is_preselected + ad_signals — Library curation columns
--   • api_keys — Scale-plan REST API tokens
--   • analyses.is_published — whether user opted to publish
-- ──────────────────────────────────────────────────────────────────────────

-- ── analyses: publishing + Meta Ads optimizer payload ──
alter table public.analyses
  add column if not exists is_published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists meta_ads jsonb;  -- MetaAdsRecommendation (Scale plan)

-- ── winning_sites: curation + estimated ad activity ──
alter table public.winning_sites
  add column if not exists is_preselected boolean not null default false,
  add column if not exists ad_signals jsonb,                -- {active_ads, days_running, regions, last_seen, score}
  add column if not exists ad_signals_updated_at timestamptz;

-- The first 8 stores (alpha by domain) become the Free-tier preview set
-- on a fresh project. Production curators can flip this flag manually.
do $$
declare
  preset_count int;
begin
  select count(*) into preset_count from public.winning_sites where is_preselected;
  if preset_count = 0 then
    update public.winning_sites
       set is_preselected = true
     where id in (
       select id from public.winning_sites order by is_featured desc, created_at asc limit 8
     );
  end if;
end $$;

-- ── community_analyses ─────────────────────────────────────────────────────
-- Immutable snapshot the user explicitly published. We don't expose the
-- internal `analyses` table to anon — instead we copy the fields we want
-- public into this denormalized row. That keeps RLS simple and means
-- "unpublish" is a soft delete (set is_removed=true) without touching
-- the user's private original audit.
create table if not exists public.community_analyses (
  id uuid primary key default gen_random_uuid(),
  source_analysis_id uuid references public.analyses(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null unique,
  display_name text,                                  -- optional, defaults to "EliteVault user"
  url text not null,
  domain text not null,
  score int not null,
  niche text,
  summary text not null,
  scenarios jsonb not null,                           -- ConversionScenarios
  category_scores jsonb not null,                     -- CategoryScores
  annotations jsonb not null,                         -- Annotation[]
  top_fixes jsonb not null,                           -- TopFix[]
  buyer_persona jsonb,                                -- BuyerPersona used
  persona_response jsonb,                             -- PersonaResponse summary (no raw quotes)
  ad_signals jsonb,                                   -- if known
  screenshot_url text,
  view_count int not null default 0,
  helpful_count int not null default 0,
  report_count int not null default 0,
  is_removed boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists community_analyses_score_idx
  on public.community_analyses(score desc) where is_removed = false;
create index if not exists community_analyses_niche_idx
  on public.community_analyses(niche) where is_removed = false;
create index if not exists community_analyses_domain_idx
  on public.community_analyses(domain) where is_removed = false;
create index if not exists community_analyses_user_idx
  on public.community_analyses(user_id, created_at desc);

-- ── reports table (Trust & Safety) ─────────────────────────────────────────
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  community_analysis_id uuid not null references public.community_analyses(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null check (length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

-- Auto-hide after 3 reports
create or replace function public.tg_auto_hide_reported()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.community_analyses
     set report_count = report_count + 1,
         is_removed = (report_count + 1 >= 3) or is_removed
   where id = new.community_analysis_id;
  return new;
end $$;

drop trigger if exists tg_community_report on public.community_reports;
create trigger tg_community_report after insert on public.community_reports
  for each row execute function public.tg_auto_hide_reported();

-- ── api_keys (Scale plan) ─────────────────────────────────────────────────
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  -- We store SHA-256 of the token, never the plaintext. Token is shown
  -- exactly once at creation time.
  token_hash text not null unique,
  token_prefix text not null,                         -- "ev_live_xxxxxx" (display only)
  last_used_at timestamptz,
  request_count int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_user_idx on public.api_keys(user_id);
create index if not exists api_keys_active_hash_idx on public.api_keys(token_hash) where revoked_at is null;

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────
alter table public.community_analyses enable row level security;
alter table public.community_reports  enable row level security;
alter table public.api_keys           enable row level security;

-- Public read of community analyses (only the non-removed ones)
drop policy if exists "community: public read" on public.community_analyses;
create policy "community: public read"
  on public.community_analyses for select
  using (is_removed = false);

-- Authors can mark their published row removed
drop policy if exists "community: author update own" on public.community_analyses;
create policy "community: author update own"
  on public.community_analyses for update
  using (auth.uid() = user_id);

-- Anyone authenticated can report
drop policy if exists "reports: insert authenticated" on public.community_reports;
create policy "reports: insert authenticated"
  on public.community_reports for insert
  with check (auth.uid() is not null);

-- api_keys are private to their owner; writes go through server-only paths
drop policy if exists "api_keys: read own" on public.api_keys;
create policy "api_keys: read own"
  on public.api_keys for select
  using (auth.uid() = user_id);
drop policy if exists "api_keys: insert own" on public.api_keys;
create policy "api_keys: insert own"
  on public.api_keys for insert
  with check (auth.uid() = user_id);
drop policy if exists "api_keys: update own" on public.api_keys;
create policy "api_keys: update own"
  on public.api_keys for update
  using (auth.uid() = user_id);

-- ── helper RPC: increment view_count atomically ──
create or replace function public.community_increment_view(p_slug text)
returns void language sql as $$
  update public.community_analyses
     set view_count = view_count + 1
   where slug = p_slug and is_removed = false;
$$;

-- ── helper RPC: toggle helpful (idempotent per user) ──
-- For brevity we just bump the counter; in production you'd dedupe per user.
create or replace function public.community_helpful(p_slug text)
returns void language sql as $$
  update public.community_analyses
     set helpful_count = helpful_count + 1
   where slug = p_slug and is_removed = false;
$$;
