import type { ConversionScenarios } from "@/lib/supabase/types";
import { nicheBenchmarks } from "@/lib/meta/niche-benchmarks";

/**
 * Brief §2 — derive the four conversion-rate scenarios in code as BANDS.
 *
 * The model used to emit these as single floats (`0.028`) that the UI painted
 * as "2.80%" — false precision no screenshot can support, and a direct
 * contradiction of the product's "no fake numbers" promise. Like roas-range.ts,
 * this makes them a pure, deterministic function of (overall score, niche):
 * same inputs → same band, always, and the model stops emitting them (out of
 * ANALYSIS_TOOL_SCHEMA), which also shrinks its output — the pipeline's binding
 * constraint (§6).
 *
 * The anchor is the niche's landing-page CVR band from niche-benchmarks.ts
 * (single source of truth, shared with the Meta optimizer), scaled by the audit
 * score and by a per-scenario multiplier that reflects traffic quality:
 *   • organic           — warm, highest intent
 *   • meta_ads_good      — top-decile cold buyer
 *   • meta_ads_regular   — average cold campaign (≈ the raw niche CVR band)
 *   • meta_ads_bad       — poor creative / LP mismatch (net-loss territory)
 *
 * Every value is an `ai_estimate` (see SIGNAL_SOURCES); the UI must render each
 * scenario as a band with that provenance, never a single 2-decimal %.
 */

export type ScenarioKey = keyof ConversionScenarios;

export interface ScenarioBand {
  key: ScenarioKey;
  /** Low/high as fractions (0.013 = 1.3%). */
  low: number;
  high: number;
}

/** Per-scenario multiplier over the niche's average cold CVR band. */
const SCENARIO_FACTOR: Record<ScenarioKey, number> = {
  organic: 2.1, // warm traffic converts far above cold
  meta_ads_good: 1.55, // top media buyers
  meta_ads_regular: 1.0, // the niche baseline itself
  meta_ads_bad: 0.45, // creative/LP mismatch — a loss
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Round a fraction to 3 dp so 0.0132 → 1.3% renders cleanly. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Score gate: a weak store realizes a smaller slice of the niche band, a strong
 * one the full width (and a touch above). Mirrors roas-range.ts's shape so the
 * two panels tell the same story. score 20 → ~0.55×, score 90 → ~1.15×.
 */
function scoreFactor(score: number): number {
  const s = clamp(Number.isFinite(score) ? score : 0, 0, 100);
  return 0.55 + ((clamp(s, 20, 90) - 20) / 70) * 0.6; // 0.55 … 1.15
}

/**
 * The four conversion-rate scenarios as bands, derived from (score, niche).
 * `niche` is matched as a substring against the benchmark table (same as
 * roas-range / the optimizer); an unclassifiable niche uses the market-average
 * band.
 */
export function conversionScenarioBands(
  score: number,
  niche: string | null | undefined,
): ScenarioBand[] {
  // niche-benchmarks returns null only for an empty niche — fall back to the
  // generic ecommerce band so we always have a CVR anchor.
  const bench = nicheBenchmarks(niche || "ecommerce");
  const [cvrLo, cvrHi] = bench?.cvr ?? [0.012, 0.035];
  const sf = scoreFactor(score);

  const keys: ScenarioKey[] = [
    "organic",
    "meta_ads_bad",
    "meta_ads_regular",
    "meta_ads_good",
  ];

  return keys.map((key) => {
    const f = SCENARIO_FACTOR[key] * sf;
    let low = round3(cvrLo * f);
    let high = round3(cvrHi * f);
    // Keep a legible spread and never a zero floor on a real scenario.
    if (high - low < 0.003) high = round3(low + 0.003);
    low = Math.max(0.001, low);
    return { key, low, high };
  });
}

/**
 * Back-compat point values (band midpoints) for storage and any consumer that
 * still reads `result.scenarios` as single numbers (community publish, the Meta
 * simulator). Persisted so those paths keep working unchanged; the report UI
 * itself renders the BANDS above, never these midpoints.
 */
export function scenarioMidpoints(
  score: number,
  niche: string | null | undefined,
): ConversionScenarios {
  const bands = conversionScenarioBands(score, niche);
  const mid = (k: ScenarioKey) => {
    const b = bands.find((x) => x.key === k)!;
    return round3((b.low + b.high) / 2);
  };
  return {
    organic: mid("organic"),
    meta_ads_bad: mid("meta_ads_bad"),
    meta_ads_regular: mid("meta_ads_regular"),
    meta_ads_good: mid("meta_ads_good"),
  };
}
