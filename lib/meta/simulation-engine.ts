/**
 * Meta Campaign Scenario Modeler — deterministic engine (brief §4.2).
 *
 * Every number in a scenario (spend → impressions → clicks → purchases →
 * revenue → ROAS, plus break-even) is computed HERE, in code, from:
 *   • the niche's benchmark bands        (lib/meta/niche-benchmarks.ts)
 *   • the operator's AOV / budget / margin / country / product type / rivalry
 *   • the audit score                    (store quality → conversion rate)
 *   • the calendar month                 (seasonality)
 * The AI only writes the narrative around these numbers (see
 * ai/agents/meta-scenario-narrative-agent.ts). Before this, three model calls
 * invented the numbers and nothing checked them.
 *
 * Pure and dependency-free so it is directly property-testable:
 *   • same inputs ⇒ same output (no randomness, no clock — month is an input);
 *   • per day:  impressions = spend / CPM · 1000, clicks = impressions · CTR,
 *               purchases = clicks · CVR · attribution, revenue = purchases · AOV,
 *               ROAS = revenue / spend, CPA = spend / purchases;
 *   • conservative ≤ balanced ≤ aggressive in ROAS and purchases, always;
 *   • higher AOV ⇒ higher revenue/ROAS; higher budget ⇒ more spend/purchases;
 *     a weaker audit score never projects better than a stronger one;
 *   • break-even ROAS = 100 / margin%; each scenario states whether it earns or
 *     loses money AFTER ad spend at that margin.
 *
 * It is a MODEL, not a prediction: totals also carry a ROAS RANGE, never a
 * single falsely-precise figure.
 */
import { nicheBenchmarks } from "@/lib/meta/niche-benchmarks";

export type Variant = "conservative" | "balanced" | "aggressive";
export const VARIANTS: readonly Variant[] = ["conservative", "balanced", "aggressive"];

export type SimulatorCountry =
  | "US" | "CA" | "UK" | "AU" | "EU-W" | "EU-S" | "LATAM" | "INDIA-SEA" | "WW";
export type SimulatorProductType = "physical" | "digital" | "subscription" | "service";
export type SimulatorCompetitiveness = "low" | "medium" | "high" | "extreme";

export interface SimInputs {
  niche: string | null | undefined;
  /** Audit score 0-100 (store quality). */
  score: number;
  aovUsd: number;
  dailyBudgetUsd: number;
  /** Gross margin %, 1-100. Null/undefined ⇒ no break-even (the UI asks for it). */
  marginPct?: number | null;
  country?: SimulatorCountry | null;
  productType?: SimulatorProductType | null;
  competitiveness?: SimulatorCompetitiveness | null;
  /** 0-11. Input (not read from the clock) so the engine stays pure. */
  month: number;
}

export interface SimDay {
  day: number;
  spend: number;
  impressions: number;
  clicks: number;
  /** Decimal (0.025 = 2.5%). */
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  revenue: number;
  cpa: number;
  roas: number;
}

export interface SimEconomics {
  margin_pct: number;
  /** Minimum ROAS at which gross profit pays back the ad spend. */
  break_even_roas: number;
  /** Gross profit minus ad spend over the 7 days (before other costs). */
  net_after_ads: number;
  verdict: "profit" | "break_even" | "loss";
}

export interface SimScenarioNumbers {
  variant: Variant;
  days: SimDay[];
  totals: {
    spend: number;
    revenue: number;
    purchases: number;
    roas: number;
    cpa: number;
    /** Honest uncertainty band around `roas` — the number is never "exactly" this. */
    roas_range: [number, number];
  };
  /** Present only when the operator gave a margin. */
  economics?: SimEconomics;
}

// ── constants (each one is a documented modelling choice) ────────────────────

/** Share of the stated daily budget actually spent, per variant. */
const SPEND_FACTOR: Record<Variant, number> = { conservative: 0.6, balanced: 1, aggressive: 1.4 };
/** CPM penalty: aggressive = narrower audiences ⇒ pricier impressions. */
const CPM_FACTOR: Record<Variant, number> = { conservative: 0.95, balanced: 1, aggressive: 1.1 };
/** Conversion-efficiency factor (retargeting from day 4 helps the aggressive arm). Chosen so
 *  eff/cpm is non-decreasing across variants ⇒ ROAS ordering holds by construction. */
const EFF_FACTOR: Record<Variant, number> = { conservative: 0.9, balanced: 1, aggressive: 1.12 };
/** Hard ceiling on 7-day ROAS per variant (aggressive only unlocks a high ceiling for strong stores). */
const VARIANT_ROAS_CAP: Record<Variant, number> = { conservative: 2.2, balanced: 3.2, aggressive: 5 };
/** Uncertainty band around the point estimate. */
const RANGE: Record<Variant, [number, number]> = {
  conservative: [0.8, 1.2],
  balanced: [0.75, 1.25],
  aggressive: [0.65, 1.35],
};
/** Learning phase: days 1-3 convert worse and cost more. */
const LEARN_CVR = [0.55, 0.75, 0.95, 1, 1, 1, 1];
const LEARN_CPM = [1.15, 1.08, 1.02, 1, 1, 1, 1];
/** Ads Manager under-reports conversions 20-35% post-iOS ATT; we model the reported view. */
const ATTRIBUTION = 0.75;

const COUNTRY_CPM: Record<SimulatorCountry, number> = {
  US: 1, CA: 1, UK: 1, AU: 1, "EU-W": 0.8, "EU-S": 0.55, LATAM: 0.3, "INDIA-SEA": 0.2, WW: 0.5,
};
const PRODUCT_CTR: Record<SimulatorProductType, number> = { physical: 1, digital: 1.4, subscription: 1, service: 0.9 };
const PRODUCT_CVR: Record<SimulatorProductType, number> = { physical: 1, digital: 1.1, subscription: 0.85, service: 0.6 };

/** Score → hard ceiling on a 7-day ROAS (the table the prompt used to merely ask for). */
export function scoreRoasCeiling(score: number): number {
  if (score < 40) return 1.2;
  if (score < 55) return 1.8;
  if (score < 70) return 2.8;
  if (score < 85) return 4;
  return 5.5;
}

/** Peak (+1) / quiet (-1) / neutral (0) month per niche family; applied as ±CPM/CTR. */
function seasonality(niche: string, month: number): number {
  const n = niche.toLowerCase();
  const m = ((month % 12) + 12) % 12; // 0=Jan
  const inRange = (a: number, b: number) => (a <= b ? m >= a && m <= b : m >= a || m <= b);
  if (/apparel|fashion|cloth|wear/.test(n)) return inRange(8, 11) || inRange(1, 4) ? 1 : m === 0 || inRange(5, 7) ? -1 : 0;
  if (/fitness|gym|sport|athletic/.test(n)) return inRange(11, 1) ? 1 : inRange(3, 7) ? -1 : 0;
  if (/toy|kid|baby/.test(n)) return inRange(9, 11) ? 1 : inRange(0, 3) ? -1 : 0;
  if (/beauty|skincare|cosmetic|makeup/.test(n)) return inRange(10, 1) ? 1 : 0;
  return 0; // pet / food / home / generic: evergreen
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

function baseDays(i: SimInputs, variant: Variant): SimDay[] {
  const bands = nicheBenchmarks(i.niche ?? "") ?? nicheBenchmarks("ecommerce")!;
  const country = i.country ?? "US";
  const product = i.productType ?? "physical";
  const rivalry = i.competitiveness ?? "medium";
  const season = seasonality(i.niche ?? "", i.month);

  const [cpmLo, cpmHi] = bands.cpm;
  const cpmBase =
    rivalry === "low" ? cpmLo : rivalry === "medium" ? (cpmLo + cpmHi) / 2 : rivalry === "high" ? cpmHi : cpmHi * 1.25;
  const ctrBase = ((bands.ctr[0] + bands.ctr[1]) / 2) * PRODUCT_CTR[product] * (rivalry === "extreme" ? 0.95 : 1);
  // Store quality drives CONVERSION (not ad CTR): score 20→0 … 90→1 across the niche CVR band.
  const q = clamp((i.score - 20) / 70, 0, 1);
  const cvrBase = (bands.cvr[0] + (bands.cvr[1] - bands.cvr[0]) * q) * PRODUCT_CVR[product];

  const dailySpend = Math.max(0, i.dailyBudgetUsd) * SPEND_FACTOR[variant];
  const cpmMult = COUNTRY_CPM[country] * CPM_FACTOR[variant] * (season > 0 ? 1.15 : season < 0 ? 0.9 : 1);
  const ctrMult = season > 0 ? 1.1 : season < 0 ? 0.92 : 1;

  return Array.from({ length: 7 }, (_, d) => {
    const cpm = cpmBase * cpmMult * LEARN_CPM[d];
    const ctr = ctrBase * ctrMult;
    const cvr = cvrBase * EFF_FACTOR[variant] * LEARN_CVR[d] * ATTRIBUTION;
    const impressions = cpm > 0 ? (dailySpend / cpm) * 1000 : 0;
    const clicks = impressions * ctr;
    const purchases = clicks * cvr;
    return {
      day: d + 1,
      spend: dailySpend,
      impressions,
      clicks,
      ctr,
      cpc: clicks > 0 ? dailySpend / clicks : 0,
      cpm,
      purchases,
      revenue: purchases * Math.max(0, i.aovUsd),
      cpa: 0,
      roas: 0,
    };
  });
}

function finish(i: SimInputs, variant: Variant, days: SimDay[]): SimScenarioNumbers {
  // Hard ceiling: scale revenue/purchases down (never up) so ROAS <= min(score ceiling, variant cap) -
  // for the 7-day total AND for every single day (a day can't beat the ceiling the total can't).
  const spend = days.reduce((a, d) => a + d.spend, 0);
  const rawRevenue = days.reduce((a, d) => a + d.revenue, 0);
  const cap = Math.min(scoreRoasCeiling(i.score), VARIANT_ROAS_CAP[variant], 6);
  const scale = spend > 0 && rawRevenue / spend > cap ? (cap * spend) / rawRevenue : 1;

  // Unrounded, capped days. Totals are computed from THESE and rounded once at the end:
  // summing per-day rounded cents let rounding noise exceed the real gap between variants
  // at tiny budgets and break conservative <= balanced <= aggressive.
  const exact = days.map((d) => {
    const revScaled = d.revenue * scale;
    const revenue = d.spend > 0 ? Math.min(revScaled, cap * d.spend) : revScaled;
    const purchases = d.revenue > 0 ? d.purchases * (revenue / d.revenue) : 0;
    return { ...d, revenue, purchases };
  });

  const out: SimDay[] = exact.map((d) => ({
    day: d.day,
    spend: r2(d.spend),
    impressions: Math.round(d.impressions),
    clicks: Math.round(d.clicks),
    ctr: Math.round(d.ctr * 10000) / 10000,
    cpc: r2(d.cpc),
    cpm: r2(d.cpm),
    purchases: r2(d.purchases),
    revenue: r2(d.revenue),
    cpa: d.purchases > 0 ? r2(d.spend / d.purchases) : 0,
    roas: d.spend > 0 ? r2(d.revenue / d.spend) : 0,
  }));

  const tSpend = exact.reduce((a, d) => a + d.spend, 0);
  const tRevenue = exact.reduce((a, d) => a + d.revenue, 0);
  const tPurchases = exact.reduce((a, d) => a + d.purchases, 0);
  const roas = tSpend > 0 ? tRevenue / tSpend : 0;
  const [lo, hi] = RANGE[variant];

  const result: SimScenarioNumbers = {
    variant,
    days: out,
    totals: {
      spend: r2(tSpend),
      revenue: r2(tRevenue),
      purchases: r2(tPurchases),
      roas: r2(roas),
      cpa: tPurchases > 0 ? r2(tSpend / tPurchases) : 0,
      roas_range: [r2(roas * lo), r2(roas * hi)],
    },
  };

  const m = i.marginPct;
  if (m != null && Number.isFinite(m) && m > 0 && m <= 100) {
    const net = (tRevenue * m) / 100 - tSpend;
    const tol = tSpend * 0.05;
    result.economics = {
      margin_pct: m,
      break_even_roas: r2(100 / m),
      net_after_ads: r2(net),
      verdict: Math.abs(net) <= tol ? "break_even" : net > 0 ? "profit" : "loss",
    };
  }
  return result;
}

export function simulateAll(inputs: SimInputs): Record<Variant, SimScenarioNumbers> {
  const i: SimInputs = {
    ...inputs,
    score: clamp(Number.isFinite(inputs.score) ? inputs.score : 0, 0, 100),
  };
  const out = {} as Record<Variant, SimScenarioNumbers>;
  for (const v of VARIANTS) out[v] = finish(i, v, baseDays(i, v));
  return out;
}
