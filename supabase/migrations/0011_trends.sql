-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0011 Trends (Phase 2, retention)
--
-- A weekly, CACHED view of what's rising/falling per ecommerce niche. The
-- data is refreshed by ONE scheduled Inngest job (Gemini Flash, cheap) and
-- read by every user from cache — there is NEVER a per-user model call, which
-- keeps inference COGS flat regardless of traffic.
--
-- Provenance is first-class and honest: every signal carries whether it's an
-- AI ESTIMATE or sourced, plus the ISO-week it belongs to.
--
-- RLS: public SELECT (logged-in users browse); writes happen ONLY via the
-- service role (the cron job) — there are deliberately no insert/update
-- policies, so the client can never forge trend rows. Idempotent.
-- ──────────────────────────────────────────────────────────────────────────

do $$ begin create type trend_direction as enum ('up','down'); exception when duplicate_object then null; end $$;
do $$ begin create type trend_kind as enum ('subniche','product'); exception when duplicate_object then null; end $$;
do $$ begin create type trend_provenance as enum ('estimated','sourced'); exception when duplicate_object then null; end $$;

-- ── niches: the searchable catalog ────────────────────────────────────────
create table if not exists public.niches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── trend_signals: weekly up/down signals (sub-niches / themes) per niche ──
create table if not exists public.trend_signals (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.niches(id) on delete cascade,
  item text not null,
  kind trend_kind not null default 'subniche',
  direction trend_direction not null,
  score numeric(5,2) not null default 0,        -- momentum 0..100
  rationale text,
  provenance trend_provenance not null default 'estimated',
  source text,
  week date not null,                            -- Monday of the ISO week
  created_at timestamptz not null default now(),
  unique (niche_id, kind, item, week)
);
create index if not exists trend_signals_niche_week_idx
  on public.trend_signals(niche_id, week desc);

-- ── products_trending: weekly trending products per niche ──────────────────
create table if not exists public.products_trending (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.niches(id) on delete cascade,
  product text not null,
  direction trend_direction not null default 'up',
  score numeric(5,2) not null default 0,
  rationale text,
  provenance trend_provenance not null default 'estimated',
  source text,
  week date not null,
  created_at timestamptz not null default now(),
  unique (niche_id, product, week)
);
create index if not exists products_trending_niche_week_idx
  on public.products_trending(niche_id, week desc);

-- ── RLS: public read, service-role-only writes ────────────────────────────
alter table public.niches            enable row level security;
alter table public.trend_signals     enable row level security;
alter table public.products_trending enable row level security;

drop policy if exists "niches: public read" on public.niches;
create policy "niches: public read" on public.niches for select using (true);

drop policy if exists "trend_signals: public read" on public.trend_signals;
create policy "trend_signals: public read" on public.trend_signals for select using (true);

drop policy if exists "products_trending: public read" on public.products_trending;
create policy "products_trending: public read" on public.products_trending for select using (true);

-- ── Seed the niche catalog (idempotent) ───────────────────────────────────
insert into public.niches (slug, name, description) values
  ('skincare-beauty',       'Skincare & Beauty',      'Serums, cleansers, cosmetics, beauty tools'),
  ('fitness-wellness',      'Fitness & Wellness',     'Equipment, apparel, recovery, wearables'),
  ('home-kitchen',          'Home & Kitchen',         'Cookware, gadgets, organization, small appliances'),
  ('pet-supplies',          'Pet Supplies',           'Food, toys, grooming, accessories'),
  ('fashion-apparel',       'Fashion & Apparel',      'Clothing, shoes, seasonal trends'),
  ('jewelry-accessories',   'Jewelry & Accessories',  'Fine + costume jewelry, watches, bags'),
  ('electronics-gadgets',   'Electronics & Gadgets',  'Audio, smart home, phone accessories'),
  ('baby-kids',             'Baby & Kids',            'Gear, toys, nursery, learning'),
  ('outdoor-camping',       'Outdoor & Camping',      'Gear, hiking, travel, adventure'),
  ('supplements-nutrition', 'Supplements & Nutrition','Vitamins, protein, functional foods'),
  ('home-decor',            'Home Decor',             'Lighting, textiles, wall art, furniture'),
  ('gaming',                'Gaming',                 'Accessories, setups, collectibles'),
  ('coffee-tea',            'Coffee & Tea',           'Beans, brewing gear, matcha, accessories'),
  ('sustainable-eco',       'Sustainable & Eco',      'Reusables, refillables, ethical goods')
on conflict (slug) do nothing;
