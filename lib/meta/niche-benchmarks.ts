/**
 * Niche reference bands for the Meta Ads Optimizer targets (Fase 2 P0-1).
 *
 * A raw target ("CPC $0.94") means nothing without context. Each target is
 * shown next to its niche median band ("median $1.20–$1.60") so the operator
 * can judge whether the recommendation is aggressive or conservative for their
 * category. If we can't produce a band for a metric we hide THAT metric rather
 * than show a naked number.
 *
 * Numbers mirror the 2024-25 cold-traffic benchmark table baked into the
 * Meta Campaign Scenario agent (ai/agents/meta-campaign-scenario-agent.ts) so
 * the optimizer and the modeler tell the same story. Ranges are 0..1 for
 * rates (ctr/cvr), USD for cpm/cpc, and a multiple for roas.
 */

export interface NicheBands {
  cpc: [number, number]; // USD, derived from cpm + ctr
  cpm: [number, number]; // USD
  ctr: [number, number]; // fraction (0.015 = 1.5%)
  cvr: [number, number]; // fraction — landing-page conversion
  roas: [number, number]; // multiple
}

type RawBand = {
  keys: string[];
  cpm: [number, number];
  ctr: [number, number];
  roas: [number, number];
  cvr?: [number, number];
};

// Generic ecommerce landing-page CVR band when a niche doesn't specify one.
const DEFAULT_CVR: [number, number] = [0.012, 0.035];

const NICHE_TABLE: RawBand[] = [
  { keys: ["skincare", "beauty", "cosmetic", "makeup"], cpm: [15, 30], ctr: [0.015, 0.04], roas: [1.8, 3.5], cvr: [0.015, 0.04] },
  { keys: ["supplement", "vitamin", "health", "nutrition"], cpm: [25, 50], ctr: [0.008, 0.025], roas: [1.2, 2.5], cvr: [0.01, 0.03] },
  { keys: ["jewel", "jewellery", "watch"], cpm: [20, 40], ctr: [0.01, 0.02], roas: [2.0, 4.0], cvr: [0.008, 0.025] },
  { keys: ["pet", "dog", "cat"], cpm: [15, 25], ctr: [0.015, 0.03], roas: [2.0, 4.0], cvr: [0.015, 0.035] },
  { keys: ["fashion", "apparel", "clothing", "wear", "footwear", "shoe"], cpm: [12, 22], ctr: [0.01, 0.03], roas: [1.5, 3.0], cvr: [0.012, 0.035] },
  { keys: ["home", "decor", "furniture", "kitchen"], cpm: [10, 20], ctr: [0.01, 0.025], roas: [1.5, 3.0] },
  { keys: ["fitness", "gym", "sport", "athletic"], cpm: [15, 30], ctr: [0.01, 0.025], roas: [1.5, 3.0] },
  { keys: ["electronic", "gadget"], cpm: [20, 35], ctr: [0.01, 0.02], roas: [1.2, 2.5] },
  { keys: ["food", "snack", "beverage", "drink", "coffee", "tea"], cpm: [15, 25], ctr: [0.01, 0.03], roas: [1.3, 2.5] },
  { keys: ["toy", "kid", "baby"], cpm: [12, 22], ctr: [0.01, 0.03], roas: [1.5, 3.0] },
  { keys: ["tech", "accessor"], cpm: [15, 25], ctr: [0.015, 0.03], roas: [1.5, 2.5] },
];

// Market-average fallback (blend of the table) for unclassifiable niches.
const DEFAULT_RAW: RawBand = { keys: [], cpm: [14, 28], ctr: [0.011, 0.028], roas: [1.4, 2.8] };

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Reference bands for a niche. Returns null only if `niche` is empty — every
 * non-empty niche resolves to at least the market-average band. CPC is
 * derived: CPC = CPM / (1000 · CTR), so the widest CPC uses the highest CPM
 * with the lowest CTR and vice-versa.
 */
export function nicheBenchmarks(niche: string | null | undefined): NicheBands | null {
  const n = (niche ?? "").toLowerCase().trim();
  if (!n) return null;
  const raw = NICHE_TABLE.find((r) => r.keys.some((k) => n.includes(k))) ?? DEFAULT_RAW;
  const [cpmLo, cpmHi] = raw.cpm;
  const [ctrLo, ctrHi] = raw.ctr;
  return {
    cpm: [cpmLo, cpmHi],
    ctr: [ctrLo, ctrHi],
    roas: raw.roas,
    cvr: raw.cvr ?? DEFAULT_CVR,
    cpc: [round(cpmLo / 1000 / ctrHi), round(cpmHi / 1000 / ctrLo)],
  };
}
