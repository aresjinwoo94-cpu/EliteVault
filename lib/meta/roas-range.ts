/**
 * Deterministic 7-day ROAS RANGE for the free post-audit panel (Fase 2 P0-3).
 *
 * This is NOT a prediction of a store's result — a real ROAS depends on
 * creative, offer, audience and budget, none of which a screenshot reveals.
 * It is the band that stores with a STRUCTURALLY SIMILAR audit profile
 * (same score, same niche) tend to model into on a 7-day cold-traffic Meta
 * test. Always presented as a modeled range with an adjacent disclaimer.
 *
 * Design requirements this satisfies:
 *   • Reproducible — a pure function of (score, niche). Same inputs → same
 *     range, always. No randomness, no time dependence.
 *   • Niche-aware — bands mirror the modeler's own 2024-25 niche benchmark
 *     table (ai/agents/meta-campaign-scenario-agent.ts). Unknown niches fall
 *     back to a market-average band.
 *   • Honest at the low end — a weak store (score < ~50) produces a range
 *     whose LOW end dips below 1.0x (a net loss), because that's what cold
 *     campaigns on a store that doesn't convert actually do. We surface the
 *     bad number rather than hide it.
 *
 * NOTE on `niche`: for an analyzer run the "niche" is inferred from the
 * domain (host.split('.')[0]), so most inputs won't match a category key and
 * will use DEFAULT_BAND. When the string does contain a known category word
 * (e.g. "skincare", "pet") we use that band. Either way the output is stable
 * for a given (score, niche) pair.
 */

export interface RoasRange {
  /** Low end of the modeled 7-day ROAS band (e.g. 1.8). */
  low: number;
  /** High end of the modeled 7-day ROAS band (e.g. 2.9). */
  high: number;
  /**
   * Whether the honest range is strong enough to frame as "ready to scale".
   * False → the store should fix conversion first; the panel switches to the
   * honest "not ready to scale yet" headline. Never invert this to flatter.
   */
  ready: boolean;
}

/**
 * Base 7-day cold-traffic ROAS band per niche category. Mirrors the modeler's
 * benchmark table so the free teaser and the paid projection tell the same
 * story. Keys are matched as substrings against the (lowercased) niche.
 */
const NICHE_BANDS: { keys: string[]; band: [number, number] }[] = [
  { keys: ["skincare", "beauty", "cosmetic", "makeup"], band: [1.8, 3.5] },
  { keys: ["supplement", "vitamin", "health", "nutrition"], band: [1.2, 2.5] },
  { keys: ["jewel", "jewellery", "watch"], band: [2.0, 4.0] },
  { keys: ["pet", "dog", "cat"], band: [2.0, 4.0] },
  { keys: ["fashion", "apparel", "clothing", "wear", "footwear", "shoe"], band: [1.5, 3.0] },
  { keys: ["home", "decor", "furniture", "kitchen"], band: [1.5, 3.0] },
  { keys: ["fitness", "gym", "sport", "athletic"], band: [1.5, 3.0] },
  { keys: ["electronic", "gadget", "tech"], band: [1.2, 2.5] },
  { keys: ["food", "snack", "beverage", "drink", "coffee", "tea"], band: [1.3, 2.5] },
  { keys: ["toy", "kid", "baby"], band: [1.5, 3.0] },
  { keys: ["accessor"], band: [1.5, 2.5] },
];

/** Market-average band for stores whose niche we can't classify. */
const DEFAULT_BAND: [number, number] = [1.4, 2.8];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function bandForNiche(niche: string): [number, number] {
  const n = (niche ?? "").toLowerCase();
  for (const { keys, band } of NICHE_BANDS) {
    if (keys.some((k) => n.includes(k))) return band;
  }
  return DEFAULT_BAND;
}

/**
 * Compute the modeled 7-day ROAS range from a real audit score + niche.
 *
 * Score gates the achievable fraction of the niche band via a linear factor:
 *   factor = 0.35 + (clamp(score,20,90) - 20) / 70 * 0.75   →  0.35 … 1.10
 * so a score of 20 realizes ~35% of the band (deep loss territory) and a
 * score of 90 slightly exceeds the nominal top. Both ends of the niche band
 * are scaled by the same factor, then rounded and floored so `high` is always
 * a sensible margin above `low`.
 *
 * Worked examples (stable, verifiable):
 *   • score 62, skincare  → factor 0.80 → 1.4× – 2.8×  (ready)
 *   • score 30, supplements → factor 0.46 → 0.5× – 1.1× (NOT ready — honest)
 *   • score 85, jewelry   → factor 1.05 → 2.1× – 4.2×  (ready)
 */
export function roasRangeForAudit(score: number, niche: string): RoasRange {
  const s = clamp(Number.isFinite(score) ? score : 0, 0, 100);
  const [baseLow, baseHigh] = bandForNiche(niche);

  const factor = 0.35 + ((clamp(s, 20, 90) - 20) / 70) * 0.75; // 0.35 … 1.10

  let low = round1(baseLow * factor);
  let high = round1(baseHigh * factor);
  // Keep a legible spread even after rounding.
  if (high - low < 0.3) high = round1(low + 0.3);
  low = Math.max(0.3, low);

  // "Ready to scale" only when the honest band is genuinely worth spending
  // on: a decent top end AND a score that can actually support cold traffic.
  const ready = s >= 55 && high >= 1.8;

  return { low, high, ready };
}
