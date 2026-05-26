-- ──────────────────────────────────────────────────────────────────────────
-- v3.7 — Community leaderboard ranking
--
-- Adds denormalized ranking columns to community_analyses so the
-- leaderboard query is a single indexed SELECT instead of computing the
-- composite_score + tier on every read.
--
-- composite_score = score + min(meta_ads_good * 200, 20)
--   • score: the analyzer's overall 0-100 score (visual + UX quality)
--   • meta_ads_good: scenarios.meta_ads_good — the analyzer's estimate of
--     the conversion rate this store would hit under TOP 10% media-buyer
--     execution. Stored in the scenarios JSONB as a decimal (0..0.08).
--   • Multiplier 200 + cap 20 means: even a perfect-conversion store can
--     gain at most 20 points over its visual score. Reward conversion
--     potential without letting it dominate (a store with bad UX but
--     theoretically high conversion shouldn't rank above a polished one).
--
-- rank_tier: the human-readable tier label ("sovereign", "magnate", etc.)
-- precomputed from composite_score so the UI doesn't have to map it on
-- every render. Tier definitions live in lib/ranking/tiers.ts.
--
-- Both columns are computed at publish time (see app/actions/community.ts)
-- and backfilled for existing rows by scripts/backfill-community-ranks.mjs.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.community_analyses
  add column if not exists composite_score numeric(6, 2) default 0;

alter table public.community_analyses
  add column if not exists rank_tier text;

-- Primary leaderboard index: order by composite_score DESC, filtered to
-- visible rows. This is THE hot path — the main community page query
-- runs against this index.
create index if not exists community_analyses_composite_idx
  on public.community_analyses(composite_score desc)
  where is_removed = false;

-- Per-tier secondary index — used when filtering the leaderboard to a
-- specific tier ("show me only Sovereigns").
create index if not exists community_analyses_tier_idx
  on public.community_analyses(rank_tier, composite_score desc)
  where is_removed = false;
