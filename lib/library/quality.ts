/**
 * Publication gate for the Library.
 *
 * The analyzer module only ever reads `status = 'published'`, so this file is
 * the one place that decides what a user is allowed to see. A row that can't
 * be stated honestly (dead site, no niche, no signal at all) never reaches
 * `published` — it parks in `review` for a human instead. A wrong store in the
 * module costs more credibility than a missing one.
 *
 * Pure functions, no I/O — the jobs do the fetching and hand the facts here.
 */

import { normalizeDomain } from "@/lib/library/domain";

export type LibraryStatus = "draft" | "review" | "published";

/** Facts a job has gathered about one candidate row. */
export interface StoreFacts {
  url: string | null | undefined;
  domain: string | null | undefined;
  title: string | null | undefined;
  niche: string | null | undefined;
  /** Site answered 2xx/3xx on the last liveness probe. */
  isLive: boolean;
  /** We have a thumbnail or a favicon to render the row with. */
  hasImage: boolean;
  /** Cached Meta active-ads count, if any. */
  activeAdsCount?: number | null;
  /** Our internal quality/momentum score, if any. */
  internalScore?: number | null;
}

export interface Verdict {
  status: LibraryStatus;
  /** Empty when publishable; otherwise every reason it isn't. */
  reasons: string[];
}

function positive(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function filled(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Decide whether a candidate can be published.
 *
 * Requirements (A.3 of the plan):
 *   1. resolvable domain + url
 *   2. a title we can print
 *   3. the site is live
 *   4. a niche assigned
 *   5. at least ONE signal (active ads, or an internal score)
 *   6. an image (thumbnail or favicon)
 */
export function judgeStore(facts: StoreFacts): Verdict {
  const reasons: string[] = [];

  if (!normalizeDomain(facts.domain ?? facts.url)) reasons.push("unresolvable domain");
  if (!filled(facts.title)) reasons.push("missing title");
  if (!facts.isLive) reasons.push("site not live");
  if (!filled(facts.niche)) reasons.push("no niche assigned");
  if (!positive(facts.activeAdsCount) && !positive(facts.internalScore)) {
    reasons.push("no signal (no active ads, no internal score)");
  }
  if (!facts.hasImage) reasons.push("no thumbnail or favicon");

  return { status: reasons.length === 0 ? "published" : "review", reasons };
}

/**
 * Momentum score, 0-100. Precomputed by the refresh job and stored — the
 * analyzer never computes it per request.
 *
 * Weighting reflects what the buyer actually asked for: "who is spending on
 * ads RIGHT NOW". Ad volume dominates; conversion rate and traffic only break
 * ties between comparably active stores. Recency decays a stale ad count so a
 * store we haven't checked in a month can't outrank one verified yesterday.
 */
export function momentumScore(input: {
  activeAdsCount?: number | null;
  convRate?: number | null;
  trafficEst?: number | null;
  adsCheckedAt?: string | Date | null;
  now?: Date;
}): number | null {
  const ads = positive(input.activeAdsCount) ? (input.activeAdsCount as number) : 0;
  const conv = positive(input.convRate) ? (input.convRate as number) : 0;
  const traffic = positive(input.trafficEst) ? (input.trafficEst as number) : 0;
  if (!ads && !conv && !traffic) return null;

  // log10 keeps a 500-ad brand from burying a 60-ad one by 8x — both are
  // "actively spending", which is the signal that matters.
  const adsPart = ads ? Math.min(60, Math.log10(ads + 1) * 22) : 0; // ≤60
  const convPart = Math.min(25, conv * 4); // ≤25 (conv stored as percent)
  const trafficPart = traffic ? Math.min(15, Math.log10(traffic) * 2.2) : 0; // ≤15

  let score = adsPart + convPart + trafficPart;

  // Freshness decay on the ad signal: full weight ≤14d, then linear to 0.6 at 60d.
  if (ads && input.adsCheckedAt) {
    const checked = new Date(input.adsCheckedAt).getTime();
    if (Number.isFinite(checked)) {
      const days = ((input.now ?? new Date()).getTime() - checked) / 86_400_000;
      if (days > 14) score *= Math.max(0.6, 1 - (days - 14) / 115);
    }
  }

  if (!Number.isFinite(score)) return null;
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

/**
 * Assumed AOV (USD) per niche — the only unobservable input to the revenue
 * model. Deliberately conservative round numbers, and the output is always
 * shown as a RANGE labelled "est.", never a figure attributed to the brand.
 */
export const NICHE_AOV: Record<string, number> = {
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
export const DEFAULT_AOV = 60;

/**
 * Modeled monthly revenue range (USD) from public signals:
 * traffic × conversion rate × niche AOV, ±20%. Null when we lack an input —
 * we show nothing rather than a made-up number.
 */
export function estRevenueRange(
  niche: string | null | undefined,
  convRate: number | null | undefined,
  trafficEst: number | null | undefined,
): { low: number; high: number } | null {
  if (!positive(convRate) || !positive(trafficEst)) return null;
  const aov = NICHE_AOV[String(niche)] ?? DEFAULT_AOV;
  const monthly = (trafficEst as number) * ((convRate as number) / 100) * aov;
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  return { low: Math.round(monthly * 0.8), high: Math.round(monthly * 1.2) };
}
