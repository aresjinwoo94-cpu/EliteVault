import { nicheBenchmarks } from "@/lib/meta/niche-benchmarks";
import { roasRangeForAudit } from "@/lib/meta/roas-range";

/**
 * Meta Ads Optimizer — keep the model's targets inside reality (brief §4.1).
 *
 * The agent proposes CPC/CPM/CTR/CVR/ROAS targets. Nothing used to stop it from
 * proposing a 6x ROAS for a store the audit says is weak, or a CPC that
 * disagrees with its own CPM and CTR — and the report then showed a target next
 * to a niche band it sat far outside of. Here, in code:
 *   • CPM / CTR / CVR are clamped into the niche's benchmark band
 *     (lib/meta/niche-benchmarks.ts — the same table the simulation engine uses);
 *   • ROAS is clamped into the audit's modeled range (lib/meta/roas-range.ts —
 *     the same function behind the free post-audit panel), so the optimizer
 *     can't promise more than the rest of the product says is plausible;
 *   • CPC is DERIVED (CPM / 1000 / CTR) so the three always agree.
 * Pure + deterministic; `adjusted` lists what had to move so the UI/ops can tell.
 */
export interface OptimizerTargets {
  cpc: number;
  cpm: number;
  ctr: number;
  roas: number;
  cvr: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function clampOptimizerTargets(
  t: OptimizerTargets,
  niche: string | null | undefined,
  score: number,
): { targets: OptimizerTargets; adjusted: (keyof OptimizerTargets)[] } {
  const bands = nicheBenchmarks(niche);
  if (!bands) return { targets: t, adjusted: [] };

  const adjusted: (keyof OptimizerTargets)[] = [];
  const pick = (key: keyof OptimizerTargets, v: number, lo: number, hi: number, dp = 4) => {
    const c = Math.round(clamp(v, lo, hi) * 10 ** dp) / 10 ** dp;
    if (Math.abs(c - v) > 10 ** -dp) adjusted.push(key);
    return c;
  };

  const cpm = pick("cpm", t.cpm, bands.cpm[0], bands.cpm[1], 2);
  const ctr = pick("ctr", t.ctr, bands.ctr[0], bands.ctr[1]);
  const cvr = pick("cvr", t.cvr, bands.cvr[0], bands.cvr[1]);
  const rr = roasRangeForAudit(score, niche ?? "");
  const roas = pick("roas", t.roas, rr.low, rr.high, 2);
  const cpc = r2(cpm / 1000 / ctr);
  if (Math.abs(cpc - t.cpc) > 0.015 && !adjusted.includes("cpc")) adjusted.push("cpc");

  return { targets: { cpc, cpm, ctr, roas, cvr }, adjusted };
}
