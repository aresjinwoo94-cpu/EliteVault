import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { runMetaSimulation } from "@/ai/agents/run-meta-simulation";
import { runMetaAdsOptimizerAgent } from "@/ai/agents/meta-ads-optimizer-agent";
import { enterMeter } from "@/lib/usage/context";
import type {
  AnalysisResult,
  BuyerPersona,
  PlanTier,
} from "@/lib/supabase/types";

/**
 * Meta Campaign Scenario Modeler — durable Inngest function.
 *
 * Triggered by the `meta-simulation/requested` event when a Scale-plan
 * user submits AOV + daily budget on an existing analysis. Runs the
 * 3-scenario orchestrator (which itself fans out into 3 parallel
 * Gemini Flash-Lite calls) and persists whatever succeeded.
 *
 * Partial success is FINE here — if 1 of 3 scenarios blows up we still
 * write the other 2 with `status='succeeded'` and surface the errors
 * in the `error` column for the UI to display as a soft warning.
 *
 * Only if ALL THREE scenarios fail do we mark `status='failed'`. That
 * keeps the Scale user from staring at "queued" forever when one
 * variant happens to trip the schema validator.
 */
export const runMetaSimulationFn = inngest.createFunction(
  {
    id: "run-meta-simulation",
    name: "Run Meta Campaign Scenario Modeler",
    retries: 1,
    onFailure: async ({ event, error }) => {
      const service = createSupabaseServiceClient();
      const data = (event as unknown as {
        data: { event: { data: { simulationId: string } } };
      }).data.event.data;

      const msg =
        error instanceof Error ? error.message : String(error);
      await service
        .from("meta_simulations")
        .update({
          status: "failed",
          error: msg.slice(0, 500),
          finished_at: new Date().toISOString(),
        })
        .eq("id", data.simulationId);
    },
  },
  { event: "meta-simulation/requested" },
  async ({ event, step }) => {
    const {
      simulationId,
      analysisId,
      userId,
      aovUsd,
      dailyBudgetUsd,
      productMarginPct,
      country,
      productType,
      competitiveness,
      notes,
      plan,
    } = event.data;

    // Attribute the 3 Gemini scenario calls to this user for the cost ledger.
    enterMeter({
      userId,
      plan: (plan as PlanTier | null | undefined) ?? null,
      eventType: "meta_simulation",
      meta: { simulationId, analysisId },
    });

    const service = createSupabaseServiceClient();

    // Step 1: mark running
    await step.run("mark-running", async () => {
      await service
        .from("meta_simulations")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
        })
        .eq("id", simulationId);
    });

    // Step 2: load source analysis to feed the agent.
    // Done as a durable step so retries don't refetch.
    const ctx = await step.run("load-analysis-context", async () => {
      const { data: row, error: err } = await service
        .from("analyses")
        .select("url, result, user_id, meta_ads, buyer_persona")
        .eq("id", analysisId)
        .single();
      if (err || !row) {
        throw new Error(`Analysis ${analysisId} not found: ${err?.message ?? "no row"}`);
      }
      if (row.user_id !== userId) {
        // Hard refuse — the server action should have validated this,
        // but Inngest events can be replayed and we want defence in depth.
        throw new Error("Analysis owner mismatch — refusing to run simulation");
      }
      const result = row.result as AnalysisResult | null;
      if (!result || typeof result.score !== "number") {
        throw new Error("Source analysis has no completed result");
      }
      const host = row.url
        ? new URL(row.url).hostname.replace("www.", "")
        : "ecommerce";
      const niche = host.split(".")[0];
      return {
        url: row.url ?? "",
        score: result.score,
        summary: result.summary ?? "",
        niche,
        // Fase 2 — the Meta BLOCK bundles the Optimizer with the Modeler.
        // If this analysis has no Ads-Optimizer output yet (Pro audits skip
        // it at audit time to save cost), compute it now as part of this run.
        needsMetaAds: row.meta_ads == null,
        topFixes: result.top_fixes ?? [],
        persona: (row.buyer_persona as BuyerPersona | null) ?? null,
      };
    });

    // Step 3: run the 3 scenarios sequentially with stagger (orchestrator internal)
    const scenarios = await step.run("run-3-scenarios", async () => {
      return runMetaSimulation({
        url: ctx.url,
        score: ctx.score,
        summary: ctx.summary,
        niche: ctx.niche,
        aovUsd,
        dailyBudgetUsd,
        productMarginPct,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        country: (country ?? null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        productType: (productType ?? null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        competitiveness: (competitiveness ?? null) as any,
        notes,
      });
    });

    // Step 4: persist. Partial success is OK.
    await step.run("save-scenarios", async () => {
      const allFailed =
        !scenarios.conservative &&
        !scenarios.balanced &&
        !scenarios.aggressive;

      await service
        .from("meta_simulations")
        .update({
          conservative: scenarios.conservative,
          balanced: scenarios.balanced,
          aggressive: scenarios.aggressive,
          status: allFailed ? "failed" : "succeeded",
          error:
            scenarios.errors.length > 0
              ? scenarios.errors.join(" | ").slice(0, 500)
              : null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", simulationId);
    });

    // Step 5 (Fase 2 P0-2): the Meta block = Modeler + Ads Optimizer as ONE
    // unit. If the analysis lacks Ads-Optimizer output (Pro audits skip it at
    // audit time), compute + persist it now so a Pro user's single monthly run
    // delivers both. Skipped for Scale (already computed at audit time) and
    // never blocks the simulation result if it fails.
    if (ctx.needsMetaAds) {
      await step.run("run-meta-ads-optimizer", async () => {
        try {
          const metaAds = await runMetaAdsOptimizerAgent({
            url: ctx.url,
            score: ctx.score,
            summary: ctx.summary,
            topFixes: ctx.topFixes,
            persona: ctx.persona,
            niche: ctx.niche,
            siteInfo: null,
          });
          if (metaAds) {
            await service
              .from("analyses")
              .update({ meta_ads: metaAds })
              .eq("id", analysisId);
          }
        } catch (err) {
          console.warn(
            "[meta-simulation] ads-optimizer skipped:",
            (err as Error).message,
          );
        }
      });
    }

    return {
      simulationId,
      hadAny:
        !!scenarios.conservative ||
        !!scenarios.balanced ||
        !!scenarios.aggressive,
      errorCount: scenarios.errors.length,
    };
  },
);
