/**
 * Community leaderboard ranking system (v3.7).
 *
 * Every published audit gets a `composite_score` (0..100) and a
 * `rank_tier` (one of the 10 tier keys below). Both are stored as
 * columns on community_analyses so the leaderboard query is just an
 * indexed ORDER BY — no per-row computation at read time.
 *
 * The composite score is intentionally NOT just the analyzer's overall
 * score. A polished store with weak conversion potential isn't really
 * "winning" in the DTC sense. We blend visual quality (score) with
 * realistic conversion ceiling (scenarios.meta_ads_good) so the leaderboard
 * rewards stores that both LOOK good AND CONVERT well.
 *
 * Formula:
 *   composite = score + min(meta_ads_good * 200, 20)
 *
 *   • score: 0..100 from analyzer
 *   • meta_ads_good: 0..0.08 decimal (top-10% media-buyer execution)
 *   • multiplier 200 + cap 20: even a perfect-conversion store can only
 *     add 20 points over its visual score — keeps the leaderboard from
 *     being gamed by stores with bad UX but theoretically high CVR
 *
 * Tier thresholds are FIXED. A score 95+ is always Sovereign — never
 * relative to other users. This makes ranking feel like a real
 * achievement (your tier doesn't drop just because someone new published
 * a 96-score audit).
 */

export interface RankTier {
  /** Stable identifier stored in DB (`rank_tier` column) */
  key: string;
  /** Display name shown on badges */
  name: string;
  /** 1-line motivator / description */
  tagline: string;
  /** Minimum composite_score required to enter this tier */
  minScore: number;
  /** Position in the ladder (1 = lowest, 10 = highest) */
  level: number;
  /** Lucide icon name (resolved at render time) */
  iconName: string;
  /** Tailwind classes for text + ring + bg accent */
  textClass: string;
  ringClass: string;
  bgClass: string;
  /** Top 3 tiers get a "glow" treatment in the UI */
  isElite: boolean;
}

/**
 * 10-tier ladder. Ordered from LOWEST to HIGHEST — getRankTier()
 * iterates from the top and returns the first match.
 *
 * Naming philosophy: timeless, success-coded, ecommerce-adjacent.
 * Deliberately NOT named after real people (Musk, Bezos) to avoid
 * publicity-rights issues + age out gracefully over years.
 */
export const RANK_TIERS: RankTier[] = [
  {
    key: "apprentice",
    name: "Apprentice",
    tagline: "Starting the climb",
    minScore: 0,
    level: 1,
    iconName: "Sprout",
    textClass: "text-white/60",
    ringClass: "ring-white/15",
    bgClass: "bg-white/[0.03]",
    isElite: false,
  },
  {
    key: "founder",
    name: "Founder",
    tagline: "First product, first orders",
    minScore: 28,
    level: 2,
    iconName: "Flag",
    textClass: "text-sky-300",
    ringClass: "ring-sky-400/25",
    bgClass: "bg-sky-400/[0.04]",
    isElite: false,
  },
  {
    key: "builder",
    name: "Builder",
    tagline: "Foundations laid, growing steady",
    minScore: 38,
    level: 3,
    iconName: "Hammer",
    textClass: "text-teal-300",
    ringClass: "ring-teal-400/25",
    bgClass: "bg-teal-400/[0.04]",
    isElite: false,
  },
  {
    key: "operator",
    name: "Operator",
    tagline: "Repeatable systems running",
    minScore: 48,
    level: 4,
    iconName: "Cog",
    textClass: "text-emerald-300",
    ringClass: "ring-emerald-400/25",
    bgClass: "bg-emerald-400/[0.04]",
    isElite: false,
  },
  {
    key: "scaler",
    name: "Scaler",
    tagline: "Profitable paid acquisition",
    minScore: 56,
    level: 5,
    iconName: "TrendingUp",
    textClass: "text-lime-300",
    ringClass: "ring-lime-400/25",
    bgClass: "bg-lime-400/[0.04]",
    isElite: false,
  },
  {
    key: "empire",
    name: "Empire",
    tagline: "Multiple channels firing",
    minScore: 64,
    level: 6,
    iconName: "Castle",
    textClass: "text-yellow-300",
    ringClass: "ring-yellow-400/25",
    bgClass: "bg-yellow-400/[0.04]",
    isElite: false,
  },
  {
    key: "mogul",
    name: "Mogul",
    tagline: "Category dominance in sight",
    minScore: 72,
    level: 7,
    iconName: "Diamond",
    textClass: "text-orange-300",
    ringClass: "ring-orange-400/30",
    bgClass: "bg-orange-400/[0.05]",
    isElite: false,
  },
  {
    key: "titan",
    name: "Titan",
    tagline: "Outsized leverage, premium execution",
    minScore: 80,
    level: 8,
    iconName: "Mountain",
    textClass: "text-rose-300",
    ringClass: "ring-rose-400/30",
    bgClass: "bg-rose-400/[0.05]",
    isElite: true,
  },
  {
    key: "magnate",
    name: "Magnate",
    tagline: "Industry-defining brand",
    minScore: 88,
    level: 9,
    iconName: "Crown",
    textClass: "text-champagne-300",
    ringClass: "ring-champagne-400/35",
    bgClass: "bg-champagne-400/[0.06]",
    isElite: true,
  },
  {
    key: "sovereign",
    name: "Sovereign",
    tagline: "Top 0.1% — the bar everyone else aims at",
    minScore: 95,
    level: 10,
    iconName: "Gem",
    textClass: "text-gold-gradient",
    ringClass: "ring-champagne-400/50",
    bgClass: "bg-champagne-400/[0.08]",
    isElite: true,
  },
];

const TIERS_DESCENDING = [...RANK_TIERS].sort((a, b) => b.minScore - a.minScore);

/**
 * Normalize score input. Most analyzer runs return 0..100, but Flash-Lite
 * occasionally returns 0..1 — we handle both defensively.
 */
function normalizeScoreRaw(raw: number | null | undefined): number {
  const n = typeof raw === "number" && isFinite(raw) ? raw : 0;
  return n > 1 ? n : n * 100;
}

/**
 * Compute the composite_score (0..100) from an analyzer result.
 * Pass the result object as-is — we handle missing/malformed fields.
 */
export function computeCompositeScore(result: {
  score?: number | null;
  scenarios?: { meta_ads_good?: number | null } | null;
}): number {
  const score = normalizeScoreRaw(result.score);
  const metaGood = result.scenarios?.meta_ads_good ?? 0;
  const safeMetaGood =
    typeof metaGood === "number" && isFinite(metaGood) ? metaGood : 0;
  const bonus = Math.min(safeMetaGood * 200, 20);
  const composite = Math.max(0, Math.min(100, score + bonus));
  return Math.round(composite * 100) / 100; // 2 decimals
}

/**
 * Map a composite_score to its tier. Returns the lowest tier
 * (Apprentice) as a fallback so the function never returns null.
 */
export function getRankTier(composite: number): RankTier {
  const c = typeof composite === "number" && isFinite(composite) ? composite : 0;
  for (const tier of TIERS_DESCENDING) {
    if (c >= tier.minScore) return tier;
  }
  return RANK_TIERS[0];
}

/** Convenience: combine both — used at publish time. */
export function rankFromResult(result: {
  score?: number | null;
  scenarios?: { meta_ads_good?: number | null } | null;
}): { compositeScore: number; rankTier: string; tier: RankTier } {
  const compositeScore = computeCompositeScore(result);
  const tier = getRankTier(compositeScore);
  return { compositeScore, rankTier: tier.key, tier };
}

/** Lookup helper for UI — handle the case where DB tier key isn't recognized. */
export function tierByKey(key: string | null | undefined): RankTier {
  if (!key) return RANK_TIERS[0];
  return RANK_TIERS.find((t) => t.key === key) ?? RANK_TIERS[0];
}
