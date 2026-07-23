import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { NICHE_LABELS } from "@/lib/library/niche-pages";
import { metaAdLibraryUrl, faviconUrl, normalizeDomain } from "@/lib/library/domain";
import { estRevenueRange } from "@/lib/library/quality";
import { nicheWinnersEnabled } from "@/lib/flags";

/**
 * Data layer for the analyzer's "🔥 Winners in your niche — live" module
 * (FASE B). Given the niche of the store the user just analyzed, it returns
 * the 3 most active winning stores in that same niche, straight from the
 * Library (`winning_sites`).
 *
 * # Everything here is precomputed. Nothing is fetched per request.
 * The jobs in scripts/library/ do all the work ahead of time:
 *   • discover.ts  → new stores land as `draft`
 *   • verify.ts    → probes them, runs the publication gate, sets `published`
 *   • momentum.ts  → `active_ads_count`, `est_revenue_*`, `momentum_score`
 * This file only runs ONE filtered `select … limit`. No LLM call, no Meta call,
 * no Shopify call on the user's request path. That is what makes the module
 * cheap enough to sit at the top of every report.
 *
 * # It can never break the report
 * The audit the user paid a credit for is the score, the annotated screenshot
 * and the fixes. This card is a bonus. Every failure mode — flag off, niche
 * undetectable, Library empty, migration 0017 not applied, service client
 * missing an env var — resolves to `null`, which the page renders as nothing.
 */

/** A single winning store row surfaced in the module. */
export interface NicheWinner {
  title: string;
  domain: string;
  url: string;
  /** Favicon we can render next to the name. */
  faviconUrl: string;
  /** The store's OWN niche label (e.g. "Skincare"). */
  nicheLabel: string;
  /** True when the store is in the exact detected niche (vs a related fill). */
  exactMatch: boolean;
  /** How close this store's niche is to the analyzed one, 0-100. */
  matchPct: number;
  /** Cached count of active Meta ads, or null when we have no data. */
  activeAds: number | null;
  /** Deep link to this brand's live creatives in the public Meta Ad Library. */
  adsUrl: string;
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
 * Niche-match percentage shown on the row ("Skincare · 88% similar").
 *
 * Deterministic and defensible rather than a fake similarity model: the exact
 * niche is 100%, and each step down the hand-curated RELATED_NICHES list is a
 * fixed notch lower. The number exists to tell the buyer how literally to take
 * the comparison — not to imply a computed embedding distance.
 */
const RELATED_MATCH_PCT = [88, 82, 76];
function matchPctFor(detected: string, storeNiche: string): number {
  if (detected === storeNiche) return 100;
  const idx = (RELATED_NICHES[detected] ?? []).indexOf(storeNiche);
  return idx >= 0 ? (RELATED_MATCH_PCT[idx] ?? 70) : 70;
}

/** Raw shape of the winning_sites columns we read. */
interface WinningRow {
  url: string;
  domain: string;
  title: string;
  niche: string;
  metrics: { conv_rate?: number; traffic_est?: number } | null;
  ad_signals: { active_ads?: number } | null;
  is_featured: boolean;
  // ── Added by migration 0017. Absent on a DB that hasn't run it yet, which
  // is exactly why every read below is defensive (see LEGACY_COLS).
  favicon_url?: string | null;
  active_ads_count?: number | null;
  est_revenue_low?: number | null;
  est_revenue_high?: number | null;
  momentum_score?: number | null;
  status?: string | null;
  is_live?: boolean | null;
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

/** Active-ads count, preferring the precomputed column over the legacy blob. */
function adsOf(row: WinningRow): number | null {
  return num(row.active_ads_count) ?? num(row.ad_signals?.active_ads);
}

/**
 * Revenue range: the precomputed columns when momentum.ts has run, otherwise
 * modeled on the fly from the same public signals (pure arithmetic, no I/O).
 */
function revenueOf(row: WinningRow): { low: number; high: number } | null {
  const low = num(row.est_revenue_low);
  const high = num(row.est_revenue_high);
  if (low && high) return { low, high };
  return estRevenueRange(
    row.niche,
    row.metrics?.conv_rate ?? null,
    row.metrics?.traffic_est ?? null,
  );
}

/**
 * Row → view model, or null when the row can't be rendered honestly.
 *
 * A Library row can be partially filled (a store added by discovery before its
 * momentum job ran). Rendering one yields "undefined" in the card or a link to
 * nowhere, so we drop the row instead — the module shows fewer winners rather
 * than broken ones.
 */
function toWinner(row: WinningRow, detectedNiche: string): NicheWinner | null {
  const domain = normalizeDomain(row?.domain ?? row?.url) ?? str(row?.domain);
  const url = str(row?.url) ?? (domain ? `https://${domain}` : null);
  if (!domain || !url) return null;
  const title = str(row.title) ?? domain;
  return {
    title,
    domain,
    url,
    faviconUrl: str(row.favicon_url) ?? faviconUrl(domain),
    nicheLabel: NICHE_LABELS[row.niche]?.label ?? str(row.niche) ?? "Ecommerce",
    exactMatch: row.niche === detectedNiche,
    matchPct: matchPctFor(detectedNiche, row.niche),
    activeAds: adsOf(row),
    // The brand NAME finds far more of a store's creatives than its domain
    // does, since that's what the Page is called on Meta.
    adsUrl: metaAdLibraryUrl(title),
    revenue: revenueOf(row),
  };
}

/**
 * Rank: precomputed momentum first (what the plan asks for), then live ad
 * volume, then featured, then conversion rate. The fallbacks matter on a DB
 * where momentum.ts hasn't run yet — order stays sensible instead of arbitrary.
 */
function rank(a: WinningRow, b: WinningRow): number {
  return (
    (num(b.momentum_score) ?? 0) - (num(a.momentum_score) ?? 0) ||
    (adsOf(b) ?? 0) - (adsOf(a) ?? 0) ||
    Number(b.is_featured) - Number(a.is_featured) ||
    (num(b.metrics?.conv_rate) ?? 0) - (num(a.metrics?.conv_rate) ?? 0)
  );
}

/** Columns added by 0017 — requested first, dropped if the DB lacks them. */
const FULL_COLS =
  "url, domain, title, niche, metrics, ad_signals, is_featured, favicon_url, active_ads_count, est_revenue_low, est_revenue_high, momentum_score, status, is_live";
/** Pre-0017 column set. The module keeps working on an un-migrated DB. */
const LEGACY_COLS = "url, domain, title, niche, metrics, ad_signals, is_featured";

/**
 * Top winning stores for a detected niche. Exact-niche stores first (ranked by
 * momentum), backfilled from related niches when the exact niche has fewer
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
    const niches = [niche, ...related];

    // ONE round-trip for the exact niche AND its related fills.
    //
    // `published` + `is_live` is the credibility contract: unverified drafts
    // and dead storefronts are invisible to users. But those columns only
    // exist after migration 0017, so a failure falls back to the legacy column
    // set rather than blanking the module on a DB that hasn't migrated yet.
    let rows: WinningRow[] = [];
    const full = await service
      .from("winning_sites")
      .select(FULL_COLS)
      .in("niche", niches)
      .eq("status", "published")
      .eq("is_live", true)
      .order("momentum_score", { ascending: false, nullsFirst: false })
      .limit(60);

    if (full.error) {
      // Missing column / renamed column / RLS change. Log it — silence here
      // would hide a real schema drift — then serve the legacy shape.
      console.warn(
        `[niche-winners] full query failed, falling back to legacy columns: ${full.error.message}`,
      );
      const legacy = await service
        .from("winning_sites")
        .select(LEGACY_COLS)
        .in("niche", niches)
        .limit(60);
      if (legacy.error) {
        console.warn(`[niche-winners] legacy query error: ${legacy.error.message}`);
        return empty;
      }
      rows = (Array.isArray(legacy.data) ? legacy.data : []) as unknown as WinningRow[];
    } else {
      rows = (Array.isArray(full.data) ? full.data : []) as unknown as WinningRow[];
    }

    // Exact-niche winners first, ranked by momentum.
    const winners: NicheWinner[] = rows
      .filter((r) => r?.niche === niche)
      .sort(rank)
      .slice(0, 3)
      .map((r) => toWinner(r, niche))
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
        const fill = toWinner(row, niche);
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
  /** How many rows are hidden behind the paywall (Free only). */
  lockedCount: number;
}

/**
 * Apply freemium gating to a fetched result. Pure — no I/O — so the rule that
 * decides what a Free client receives is directly testable.
 *
 * Pro/Scale get every winner. Free gets ONE REAL winner plus a COUNT of what's
 * hidden: enough to prove the data exists, not enough to skip the upgrade.
 */
export function gateWinners(
  data: NicheWinnersResult,
  isPaid: boolean,
): NicheWinnersModule | null {
  const winners = Array.isArray(data?.winners) ? data.winners : [];
  if (winners.length === 0) return null;

  if (isPaid) {
    return {
      nicheLabel: data.nicheLabel,
      locked: false,
      winners: winners.slice(0, 3),
      lockedCount: 0,
    };
  }
  return {
    nicheLabel: data.nicheLabel,
    locked: true,
    winners: winners.slice(0, 1),
    lockedCount: Math.max(0, Math.min(3, winners.length) - 1),
  };
}

/**
 * Build the "Winners in your niche" module for an analyzed store — the single
 * entry point the analyzer page should use.
 *
 * # This module is an ENRICHMENT, never a blocker
 * Every failure mode resolves to `null`, which the page renders as "nothing".
 * `Promise.allSettled` (rather than a bare try/catch) is what guarantees that
 * even a synchronous throw while *constructing* the promise is contained.
 *
 * # Free users get the aha, not a wall
 * Free sees ONE REAL winner — the actual store, its ad count, its Meta Ad
 * Library link — plus two locked rows. Blocking the aha entirely kills the
 * upgrade motive; showing a slice of it and locking the rest is the upsell,
 * delivered at the exact moment the user learns the data exists.
 *
 * The locked rows' real data NEVER leaves the server: we send the visible row
 * plus a COUNT. Gating in the component alone would ship every store in the
 * RSC payload, where anyone can read it.
 */
export async function loadNicheWinnersModule(input: {
  status: string;
  url: string | null;
  summary?: string | null;
  isPaid: boolean;
}): Promise<NicheWinnersModule | null> {
  // Kill switch — off means the page never even queries.
  if (!nicheWinnersEnabled()) return null;
  // Nothing to enrich until the audit itself succeeded.
  if (input.status !== "succeeded") return null;

  const [settled] = await Promise.allSettled([
    (async () => {
      const niche = resolveNiche({ url: input.url, summary: input.summary });
      if (!niche) return null;
      const data = await getNicheWinners(niche);
      return gateWinners(data, input.isPaid);
    })(),
  ]);

  if (settled.status === "rejected") {
    console.warn("[niche-winners] module skipped:", settled.reason);
    return null;
  }
  return settled.value;
}
