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

/** Non-empty string or null — keeps `undefined`/"" out of the rendered card. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
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

/**
 * Row → view model, or null when the row can't be rendered honestly.
 *
 * A Library row is seeded data that can be partially filled (a store added by
 * the discovery agent before its metrics job ran). Rendering one of those
 * yields "undefined" in the card or a link to nowhere, so we drop the row
 * instead — the module shows fewer winners rather than broken ones.
 */
function toWinner(row: WinningRow, exactMatch: boolean): NicheWinner | null {
  const domain = str(row?.domain);
  const url = str(row?.url);
  if (!domain || !url) return null;
  return {
    title: str(row.title) ?? domain,
    domain,
    url,
    nicheLabel: NICHE_LABELS[row.niche]?.label ?? str(row.niche) ?? "Ecommerce",
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
    const related = RELATED_NICHES[niche] ?? [];

    // ONE round-trip for the exact niche AND its related fills — this runs on
    // the analyzer result render, so it stays a single cheap query.
    const { data, error } = await service
      .from("winning_sites")
      .select(SELECT_COLS)
      .in("niche", [niche, ...related])
      .limit(60);
    // A Supabase error arrives as a VALUE, not a throw (renamed column, RLS
    // change, table missing). Silently treating that as "no data" is right
    // here — the module hides — but it must still be visible in the logs.
    if (error) {
      console.warn("[niche-winners] query error:", error.message);
      return empty;
    }
    const rows = (Array.isArray(data) ? data : []) as unknown as WinningRow[];

    // Exact-niche winners first, ranked by Meta momentum.
    const winners: NicheWinner[] = rows
      .filter((r) => r?.niche === niche)
      .sort(rank)
      .slice(0, 3)
      .map((r) => toWinner(r, true))
      .filter((w): w is NicheWinner => w !== null);

    // Backfill from related niches, honoring the RELATED_NICHES priority.
    if (winners.length < 3) {
      const seen = new Set(winners.map((w) => w.domain));
      const fills = rows
        .filter((r) => r.niche !== niche)
        .sort(
          (a, b) =>
            related.indexOf(a.niche) - related.indexOf(b.niche) || rank(a, b),
        );
      for (const row of fills) {
        if (winners.length >= 3) break;
        const fill = toWinner(row, false);
        if (!fill || seen.has(fill.domain)) continue;
        seen.add(fill.domain);
        winners.push(fill);
      }
    }

    return { niche, nicheLabel, winners };
  } catch (err) {
    console.warn("[niche-winners] fetch failed:", (err as Error).message);
    return empty;
  }
}

/** What the analyzer page hands to the <NicheWinners> card. */
export interface NicheWinnersModule {
  nicheLabel: string;
  locked: boolean;
  winners: NicheWinner[];
  lockedCount: number;
}

/**
 * Build the "Winners in your niche" module for an analyzed store — the single
 * entry point the analyzer page should use.
 *
 * # This module is an ENRICHMENT, never a blocker
 * The audit the user paid a credit for is the score, the annotated screenshot
 * and the fixes. This card is a bonus on top. So every failure mode here —
 * niche undetectable, Library empty for that niche, a schema change, the
 * service client failing to construct because an env var is missing — resolves
 * to `null`, which the page renders as "nothing". It can never take down the
 * report around it.
 *
 * `Promise.allSettled` (rather than a bare try/catch) is what guarantees that
 * even a synchronous throw while *constructing* the promise is contained.
 *
 * # Free users
 * The real rows never leave the server for a Free viewer: we return `locked`
 * plus a row COUNT, and the client renders blurred skeletons. Gating in the
 * component alone would ship the data in the RSC payload, where anyone can
 * read it.
 */
export async function loadNicheWinnersModule(input: {
  status: string;
  url: string | null;
  summary?: string | null;
  isPaid: boolean;
}): Promise<NicheWinnersModule | null> {
  // Nothing to enrich until the audit itself succeeded.
  if (input.status !== "succeeded") return null;

  const [settled] = await Promise.allSettled([
    (async () => {
      const niche = resolveNiche({ url: input.url, summary: input.summary });
      if (!niche) return null;
      const data = await getNicheWinners(niche);
      if (data.winners.length === 0) return null;
      return input.isPaid
        ? {
            nicheLabel: data.nicheLabel,
            locked: false,
            winners: data.winners,
            lockedCount: data.winners.length,
          }
        : {
            nicheLabel: data.nicheLabel,
            locked: true,
            winners: [] as NicheWinner[], // real data withheld from Free clients
            lockedCount: Math.min(3, data.winners.length),
          };
    })(),
  ]);

  if (settled.status === "rejected") {
    console.warn("[niche-winners] module skipped:", settled.reason);
    return null;
  }
  return settled.value;
}
