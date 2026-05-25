"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { PLANS } from "@/lib/stripe/plans";

/**
 * Server action that kicks off a Meta Campaign Scenario Modeler run.
 *
 * Scale-only by design — gated server-side; the UI also hides the form
 * for Free/Pro but never trust the UI.
 *
 * Flow:
 *   1. Auth + plan check
 *   2. Validate the source analysis belongs to the user and succeeded
 *   3. Insert meta_simulations row (status=queued)
 *   4. Fire Inngest event meta-simulation/requested
 *   5. Return simulation id for the UI to poll
 *
 * We do NOT charge an analysis credit for this — it's bundled into the
 * Scale subscription. (If we later want to meter it, the row already
 * has the audit trail we need.)
 */

const TriggerSimulationInput = z.object({
  analysisId: z.string().uuid(),
  aovUsd: z
    .number({ invalid_type_error: "AOV must be a number" })
    .positive("AOV must be greater than 0")
    .max(10_000, "AOV looks unrealistic — cap is $10,000"),
  dailyBudgetUsd: z
    .number({ invalid_type_error: "Budget must be a number" })
    .positive("Daily budget must be greater than 0")
    .max(50_000, "Daily budget cap is $50,000"),
  productMarginPct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  notes: z.string().max(800).optional().nullable(),
});

export type TriggerSimulationResult =
  | { ok: true; simulationId: string }
  | { ok: false; error: string };

export async function triggerSimulation(
  input: z.infer<typeof TriggerSimulationInput>,
): Promise<TriggerSimulationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = TriggerSimulationInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // Plan gating
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "Profile not found" };
  const plan = PLANS[profile.plan];
  if (!plan.unlocksScale) {
    return {
      ok: false,
      error:
        "The Campaign Scenario Modeler is a Scale-plan feature. Upgrade to project Meta Ads outcomes.",
    };
  }

  // Validate source analysis: must belong to user + have a result
  const { data: analysis, error: aErr } = await supabase
    .from("analyses")
    .select("id, user_id, status, result")
    .eq("id", parsed.data.analysisId)
    .single();
  if (aErr || !analysis) {
    return { ok: false, error: "Analysis not found" };
  }
  if (analysis.user_id !== user.id) {
    return { ok: false, error: "You don't own that analysis" };
  }
  if (analysis.status !== "succeeded" || !analysis.result) {
    return {
      ok: false,
      error: "Run the analysis to completion before projecting a campaign.",
    };
  }

  // Insert simulation row (status=queued).
  // We DO NOT block re-running — the user can re-simulate at will.
  // We just create a new row each time; the latest one wins in the UI.
  const { data: row, error: insErr } = await supabase
    .from("meta_simulations")
    .insert({
      analysis_id: parsed.data.analysisId,
      user_id: user.id,
      aov_usd: parsed.data.aovUsd,
      daily_budget_usd: parsed.data.dailyBudgetUsd,
      product_margin_pct: parsed.data.productMarginPct ?? null,
      notes: parsed.data.notes ?? null,
      status: "queued",
    })
    .select("id")
    .single();
  if (insErr || !row) {
    return {
      ok: false,
      error: insErr?.message ?? "Could not queue simulation",
    };
  }

  await inngest.send({
    name: "meta-simulation/requested",
    data: {
      simulationId: row.id,
      analysisId: parsed.data.analysisId,
      userId: user.id,
      aovUsd: parsed.data.aovUsd,
      dailyBudgetUsd: parsed.data.dailyBudgetUsd,
      productMarginPct: parsed.data.productMarginPct ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  revalidatePath(`/app/analyzer/${parsed.data.analysisId}`);
  return { ok: true, simulationId: row.id };
}
