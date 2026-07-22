import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { NICHE_LABELS } from "@/lib/library/niche-pages";

/**
 * Data layer for the analyzer's "🔥 Winners in your niche — live" module
 * (Change 3). Given the niche of the store the user just analyzed, it returns
 * the 3 most active winning stores in that same niche, straight from the
 * Library (`winning_sites`) — the DB we already maintain.
 *
 * Everything here is FREE and precomputed:
 *   • The store list, revenue signals and Meta ad counts all live in
 *     `winning_sites` (seeded/refreshed by scripts/seed-library-v2.mjs and the
 *     ad-signals refresh job). The analyzer request only runs a filtered
 *     `select ... limit 3` — no LLM call, no third-party API per request.
 *   • The Meta "active ads" badge comes from `ad_signals.active_ads` (public
 *     Meta Ad Library counts, cached with `ad_signals_updated_at`). When a
 *     store has no cached count we HIDE the badge rather than show a zero.
 *   • The revenue signal is MODELED from public signals
 *     (conv_rate × traffic_est × assumed niche AOV) and always shown as a
 *     range with an "est." label — never a figure attributed to the brand.
 *
 * Niche detection reuses the canonical Library taxonomy (NICHE_LABELS) via a
 * deterministic keyword match over the analyzed store's domain + audit summary
 * — no new classifier, no extra model call.
 */

/** A single winning store row surfaced in the module. */
export interface NicheWinner {
  title: string;
  domain: string;
  url: string;
  /** The store's OWN niche label (e.g. "Skincare"). */
  nicheLabel: string;
  /** True when the store is in the exact detected niche (vs a related fill). */
  exactMatch: boolean;
  /** Cached count of active Meta ads, or null when we have no data. */
  activeAds: number | null;
  /** Modeled monthly revenue range (USD), or null when signals are missing. */
  revenue: { low: number; high: number } | null;
}

export interface NicheWinnersResult {
  /** Canonical detected niche slug (a key of NICHE_LABELS). */
  niche: string;
  /** Human label for the detected niche (e.g. "Skincare"). */
  nicheLabel: string;
  /** Up to 3 winners, exact-niche first, then related fills. */
  winners: NicheWinner[];
}

/**
 * Keyword → canonical niche slug. Order matters: more specific niches are
 * checked first so broad terms (apparel) can't swallow a footwear/eyewear
 * store. Bare "wear" is intentionally absent (it lives inside "eyewear" and
 * "footwear").
 */
const NICHE_KEYWORDS: { slug: string; keywords: string[] }[] = [
  { slug: "skincare", keywords: ["skincare", "skin care", "serum", "moisturiz", "cleanser", "spf", "dermatolog"] },
  { slug: "grooming", keywords: ["grooming", "razor", "shave", "beard", "trimmer", "manscap"] },
  { slug: "beauty", keywords: ["beauty", "makeup", "cosmetic", "lipstick", "fragrance", "mascara", "foundation", "color cosmetic"] },
  { slug: "footwear", keywords: ["footwear", "shoe", "sneaker", "boot", "sandal", "slipper", "loafer"] },
  { slug: "eyewear", keywords: ["eyewear", "glasses", "sunglasses", "optical", "blue-light", "frames"] },
  { slug: "fitness", keywords: ["fitness", "gym", "athletic", "athleisure", "workout", "yoga", "activewear", "training", "sport"] },
  { slug: "wellness", keywords: ["wellness", "supplement", "vitamin", "nutrition", "telehealth", "hydration", "greens", "health"] },
  { slug: "pet", keywords: ["pet", "dog", "cat", "puppy", "kitten"] },
  { slug: "baby", keywords: ["baby", "infant", "toddler", "parenting", "nursery", "stroller"] },
  { slug: "accessories", keywords: ["accessor", "wallet", "backpack", "watch", "jewel", "jewellery", "edc", "handbag"] },
  { slug: "home", keywords: ["home", "decor", "furniture", "kitchen", "bedding", "mattress", "sleep", "blanket", "linen", "pillow"] },
  { slug: "beverage", keywords: ["beverage", "soda", "coffee", "tea", "cereal", "snack", "drink", "juice", "food"] },
  { slug: "apparel", keywords: ["apparel", "clothing", "fashion", "dress", "denim", "hoodie", "t-shirt", "tee", "womenswear", "menswear", "outfit", "knitwear"] },
];

/**
 * Related niches used to backfill when the exact niche has fewer than 3
 * winners. Kept intentionally small and defensible so a fill still reads as
 * relevant to the buyer.
 */
const RELATED_NICHES: Record<string, string[]> = {
  skincare: ["beauty", "grooming", "wellness"],
  beauty: ["skincare", "grooming"],
  grooming: ["beauty", "skincare", "wellness"],
  wellness: ["beverage", "skincare"],
  apparel: ["footwear", "fitness", "accessories"],
  footwear: ["apparel", "fitness", "accessories"],
  fitness: ["apparel", "footwear", "wellness"],
  accessories: ["apparel", "eyewear"],
  eyewear: ["accessories", "apparel"],
  home: ["baby"],
  baby: ["home", "pet"],
  pet: ["home"],
  beverage: ["wellness"],
};

/**
 * Assumed average order value (USD) per niche, used only to MODEL the revenue
 * range. Deliberately conservative round numbers — the output is always shown
 * as an estimated range, never an exact brand figure.
 */
const NICHE_AOV: Record<string, number> = {
  skincare: 55,
  beauty: 45,
  apparel: 80,
  footwear: 110,
  fitness: 95,
  wellness: 65,
  eyewear: 130,
  accessories: 70,
  home: 120,
  grooming: 40,
  pet: 55,
  beverage: 35,
  baby: 60,
};
const DEFAULT_AOV = 60;

/** Raw shape of the winning_sites columns we read. */
interface WinningRow {
  url: string;
  domain: string;
  title: string;
  niche: string;
  metrics: { conv_rate?: number; traffic_est?: number } | null;
  ad_signals: { active_ads?: number } | null;
  is_featured: boolean;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Resolve the analyzed store to a canonical Library niche slug (or null when
 * nothing matches). Deterministic keyword scan over the domain + audit summary
 * — reuses the existing taxonomy, adds no model call.
 */
export function resolveNiche(input: {
  url: string | null;
  summary?: string | null;
}): string | null {
  let host = "";
  try {
    if (input.url) host = new URL(input.url).hostname.replace(/^www\./, "");
  } catch {
    /* uploaded screenshot / malformed URL — fall back to summary only */
  }
  const haystack = `${host} ${input.summary ?? ""}`.toLowerCase();
  if (!haystack.trim()) return null;
  for (const { slug, keywords } of NICHE_KEYWORDS) {
    if (keywords.some((k) => haystack.includes(k))) return slug;
  }
  return null;
}

/** Modeled monthly revenue range from public signals, or null if we can't. */
function estRevenue(
  niche: string,
  metrics: WinningRow["metrics"],
): { low: number; high: number } | null {
  const conv = num(metrics?.conv_rate); // stored as a percent (e.g. 4.1)
  const traffic = num(metrics?.traffic_est); // monthly visits
  if (!conv || !traffic) return null;
  const aov = NICHE_AOV[niche] ?? DEFAULT_AOV;
  const monthly = traffic * (conv / 100) * aov;
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  return {
    low: Math.round(monthly * 0.8),
    high: Math.round(monthly * 1.2),
  };
}

function toWinner(row: WinningRow, exactMatch: boolean): NicheWinner {
  return {
    title: row.title,
    domain: row.domain,
    url: row.url,
    nicheLabel: NICHE_LABELS[row.niche]?.label ?? row.niche,
    exactMatch,
    activeAds: num(row.ad_signals?.active_ads),
    revenue: estRevenue(row.niche, row.metrics),
  };
}

/** Rank: most active on Meta first, then featured, then conversion rate. */
function rank(a: WinningRow, b: WinningRow): number {
  const adsA = num(a.ad_signals?.active_ads) ?? 0;
  const adsB = num(b.ad_signals?.active_ads) ?? 0;
  return (
    adsB - adsA ||
    Number(b.is_featured) - Number(a.is_featured) ||
    (num(b.metrics?.conv_rate) ?? 0) - (num(a.metrics?.conv_rate) ?? 0)
  );
}

const SELECT_COLS = "url, domain, title, niche, metrics, ad_signals, is_featured";

/**
 * Top winning stores for a detected niche. Exact-niche stores first (ranked by
 * Meta momentum), backfilled from related niches when the exact niche has fewer
 * than 3. Returns an empty `winners` array on any failure or when the niche has
 * no stores — callers should then hide the module (graceful degradation).
 */
export async function getNicheWinners(
  niche: string,
): Promise<NicheWinnersResult> {
  const nicheLabel = NICHE_LABELS[niche]?.label ?? niche;
  const empty: NicheWinnersResult = { niche, nicheLabel, winners: [] };
  try {
    const service = createSupabaseServiceClient();

    // Exact-niche winners.
    const { data: exactData } = await service
      .from("winning_sites")
      .select(SELECT_COLS)
      .eq("niche", niche)
      .limit(24);
    const exact = (Array.isArray(exactData) ? (exactData as unknown as WinningRow[]) : [])
      .slice()
      .sort(rank);

    const winners: NicheWinner[] = exact.slice(0, 3).map((r) => toWinner(r, true));

    // Backfill from related niches when we have fewer than 3.
    if (winners.length < 3) {
      const related = RELATED_NICHES[niche] ?? [];
      const seen = new Set(winners.map((w) => w.domain));
      for (const rel of related) {
        if (winners.length >= 3) break;
        const { data: relData } = await service
          .from("winning_sites")
          .select(SELECT_COLS)
          .eq("niche", rel)
          .limit(24);
        const fills = (Array.isArray(relData) ? (relData as unknown as WinningRow[]) : [])
          .slice()
          .sort(rank);
        for (const row of fills) {
          if (winners.length >= 3) break;
          if (seen.has(row.domain)) continue;
          seen.add(row.domain);
          winners.push(toWinner(row, false));
        }
      }
    }

    return { niche, nicheLabel, winners };
  } catch (err) {
    console.warn("[niche-winners] fetch failed:", (err as Error).message);
    return empty;
  }
}
