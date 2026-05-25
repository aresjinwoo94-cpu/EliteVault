import "server-only";
import { runMetaCampaignScenarioAgent } from "./meta-campaign-scenario-agent";
import type { SimulationScenario } from "@/lib/supabase/types";

/**
 * Orchestrator: runs the 3 scenarios in parallel and returns whatever
 * succeeded. Partial-success is supported — if 1 of 3 throws, we ship
 * the other 2 + the error, rather than killing the whole simulation.
 */
export async function runMetaSimulation(opts: {
  url: string;
  score: number;
  summary: string;
  niche: string;
  aovUsd: number;
  dailyBudgetUsd: number;
  productMarginPct?: number | null;
  notes?: string | null;
  signal?: AbortSignal;
}): Promise<{
  conservative: SimulationScenario | null;
  balanced: SimulationScenario | null;
  aggressive: SimulationScenario | null;
  errors: string[];
}> {
  const variants = ["conservative", "balanced", "aggressive"] as const;

  const settled = await Promise.allSettled(
    variants.map((variant) =>
      runMetaCampaignScenarioAgent({ ...opts, variant }),
    ),
  );

  const result = {
    conservative: null as SimulationScenario | null,
    balanced: null as SimulationScenario | null,
    aggressive: null as SimulationScenario | null,
    errors: [] as string[],
  };

  settled.forEach((r, i) => {
    const v = variants[i];
    if (r.status === "fulfilled") {
      result[v] = r.value;
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      result.errors.push(`${v}: ${msg.slice(0, 200)}`);
      console.warn(`[meta-sim] ${v} failed:`, msg);
    }
  });

  return result;
}
