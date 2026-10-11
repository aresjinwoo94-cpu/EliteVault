import "server-only";
import { runScenarioNarrative } from "./meta-scenario-narrative-agent";
import {
  simulateAll,
  VARIANTS,
  type SimulatorCountry,
  type SimulatorProductType,
  type SimulatorCompetitiveness,
} from "@/lib/meta/simulation-engine";
import type { SimulationScenario } from "@/lib/supabase/types";

export type { SimulatorCountry, SimulatorProductType, SimulatorCompetitiveness };

/**
 * Orchestrator for the Meta Campaign Scenario Modeler (brief §4.2).
 *
 *   1. lib/meta/simulation-engine.ts computes EVERY number deterministically
 *      (spend → impressions → clicks → purchases → revenue → ROAS, ranges,
 *      break-even) from niche benchmarks + the operator's inputs + the audit
 *      score. Instant, reproducible, and ordered conservative ≤ balanced ≤
 *      aggressive by construction.
 *   2. ONE AI call writes the narrative for the three scenarios around those
 *      numbers (it used to be three sequential calls that also invented the
 *      numbers). If that call fails, a deterministic narrative is used — the
 *      numbers always ship, and a free-tier 429 can no longer fail a run.
 *
 * The return shape is unchanged so the Inngest function and the UI keep working.
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
  /** Injectable for tests; defaults to now. */
  now?: Date;
}): Promise<{
  conservative: SimulationScenario | null;
  balanced: SimulationScenario | null;
  aggressive: SimulationScenario | null;
  errors: string[];
}> {
  const numbers = simulateAll({
    niche: opts.niche,
    score: opts.score,
    aovUsd: opts.aovUsd,
    dailyBudgetUsd: opts.dailyBudgetUsd,
    marginPct: opts.productMarginPct ?? null,
    country: opts.country ?? null,
    productType: opts.productType ?? null,
    competitiveness: opts.competitiveness ?? null,
    month: (opts.now ?? new Date()).getMonth(),
  });

  const { narratives, usedFallback } = await runScenarioNarrative({
    url: opts.url,
    score: opts.score,
    summary: opts.summary,
    niche: opts.niche,
    scenarios: numbers,
    signal: opts.signal,
    deadlineAt: Date.now() + 25_000,
  });

  const result = {
    conservative: null as SimulationScenario | null,
    balanced: null as SimulationScenario | null,
    aggressive: null as SimulationScenario | null,
    errors: [] as string[],
  };
  for (const v of VARIANTS) {
    const n = numbers[v];
    result[v] = { ...narratives[v], variant: v, days: n.days, totals: n.totals, economics: n.economics };
  }
  // Not an error for the user: the numbers are complete. Logged for ops only.
  if (usedFallback) console.warn("[meta-sim] shipped with the deterministic narrative");
  return result;
}
