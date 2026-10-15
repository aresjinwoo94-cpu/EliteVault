import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { reportUnlockEnabled } from "@/lib/flags";
import { isAnalysisUnlocked } from "@/lib/unlocks/entitlement";

/**
 * The one Meta Campaign projection included in a one-time report unlock (WP-4, brief oct-2026 §6.4).
 *
 * It is NOT a plan quota: `assertQuota` is untouched for paid plans. A Free viewer who unlocked THIS audit may
 * run exactly ONE projection for it, counted per audit from `meta_simulations` (queued | running | succeeded —
 * a failed run does not burn it). Only reachable with REPORT_UNLOCK on and an entitlement for this audit.
 */
export const UNLOCK_PROJECTIONS_PER_REPORT = 1;

async function countProjections(analysisId: string, userId: string): Promise<number> {
  const service = createSupabaseServiceClient();
  const { count, error } = await service
    .from("meta_simulations")
    .select("id", { count: "exact", head: true })
    .eq("analysis_id", analysisId)
    .eq("user_id", userId)
    .in("status", ["queued", "running", "succeeded"]);
  if (error) throw new Error(`countProjections: ${error.message}`);
  return count ?? 0;
}

/** May this viewer start a projection for THIS audit through the unlock allowance? Fails closed. */
export async function unlockedProjectionAllowed(userId: string, analysisId: string): Promise<boolean> {
  if (!reportUnlockEnabled()) return false;
  try {
    if (!(await isAnalysisUnlocked(analysisId, userId))) return false;
    return (await countProjections(analysisId, userId)) < UNLOCK_PROJECTIONS_PER_REPORT;
  } catch (e) {
    console.warn("[unlock] projection allowance check failed (denied):", (e as Error).message);
    return false;
  }
}

/**
 * After inserting the run: two clicks racing past the pre-check must not both keep their run. The newest one
 * beyond the allowance is failed (so it does not count) and the caller reports "already used".
 * Returns true when this run is within the allowance.
 */
export async function keepRunWithinAllowance(userId: string, analysisId: string, simulationId: string): Promise<boolean> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("meta_simulations")
    .select("id, created_at")
    .eq("analysis_id", analysisId)
    .eq("user_id", userId)
    .in("status", ["queued", "running", "succeeded"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`keepRunWithinAllowance: ${error.message}`);
  const keep = ((data ?? []) as { id: string }[]).slice(0, UNLOCK_PROJECTIONS_PER_REPORT).map((r) => r.id);
  if (keep.includes(simulationId)) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service as any)
    .from("meta_simulations")
    .update({ status: "failed", error: "Projection already used for this report", finished_at: new Date().toISOString() })
    .eq("id", simulationId);
  return false;
}
