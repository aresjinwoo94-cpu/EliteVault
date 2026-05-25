import "server-only";
import {
  runMetaCampaignScenarioAgent,
  type SimulatorCountry,
  type SimulatorProductType,
  type SimulatorCompetitiveness,
} from "./meta-campaign-scenario-agent";
import type { SimulationScenario } from "@/lib/supabase/types";

/**
 * Orchestrator: runs the 3 scenarios SEQUENTIALLY with a small stagger.
 *
 * Why sequential, not parallel?
 *   Gemini Flash-Lite's free tier is 15 RPM. Firing 3 calls in parallel
 *   consumes 3 RPM in the same second — if the user just ran an analysis
 *   (1-2 RPM), or hits "Re-run" twice in 30s, they trip the per-minute
 *   quota and ALL three fail with 429. Sequential with a 2.5s gap spreads
 *   the load over ~8s and stays under the cap in normal usage.
 *
 * Why bail out on quota?
 *   If scenario 1 fails with 429, scenarios 2 and 3 will fail too — same
 *   quota window. Better to fail fast (~8s) than to drag the user through
 *   a 90s wait that ends in three identical errors.
 *
 * Partial-success is still supported — if 1 of 3 fails for a non-quota
 * reason (schema mismatch, transient API error), we ship the other 2.
 */
export async function runMetaSimulation(opts: {
  url: string;
  score: number;
  summary: string;
  niche: string;
  aovUsd: number;
  dailyBudgetUsd: number;
  productMarginPct?: number | null;
  country?: SimulatorCountry | null;
  productType?: SimulatorProductType | null;
  competitiveness?: SimulatorCompetitiveness | null;
  notes?: string | null;
  signal?: AbortSignal;
}): Promise<{
  conservative: SimulationScenario | null;
  balanced: SimulationScenario | null;
  aggressive: SimulationScenario | null;
  errors: string[];
}> {
  const variants = ["conservative", "balanced", "aggressive"] as const;
  const STAGGER_MS = 2500;

  const result = {
    conservative: null as SimulationScenario | null,
    balanced: null as SimulationScenario | null,
    aggressive: null as SimulationScenario | null,
    errors: [] as string[],
  };

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];

    // Stagger — skip on the first call
    if (i > 0) {
      await new Promise((r) => setTimeout(r, STAGGER_MS));
    }

    try {
      const scenario = await runMetaCampaignScenarioAgent({
        ...opts,
        variant,
      });
      result[variant] = scenario;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[meta-sim] ${variant} failed:`, msg);

      // Quota-aware short-circuit: if the AI provider rate-limited us,
      // the remaining variants will hit the same wall. Bail out and
      // surface a clear single error instead of three identical ones.
      const isQuota = /429|RESOURCE_EXHAUSTED|quota|rate.limit/i.test(msg);
      if (isQuota) {
        const friendly =
          "AI provider rate-limited this run (free-tier quota). Wait ~60 seconds and re-run.";
        result.errors.push(friendly);
        for (let j = i + 1; j < variants.length; j++) {
          result.errors.push(`${variants[j]}: skipped (quota exhausted)`);
        }
        break;
      }

      result.errors.push(`${variant}: ${humanizeError(msg).slice(0, 200)}`);
    }
  }

  return result;
}

function humanizeError(raw: string): string {
  if (/schema mismatch/i.test(raw)) {
    return "AI returned malformed output (retry usually fixes this)";
  }
  if (/timeout|ETIMEDOUT|ECONNRESET/i.test(raw)) {
    return "AI provider timed out — retry usually fixes this";
  }
  return raw;
}
