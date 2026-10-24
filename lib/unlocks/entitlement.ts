import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { reportUnlockEnabledFor } from "@/lib/flags";
import { hasFullReport } from "@/lib/unlocks/report-unlock";

/**
 * Server-side lookup of the one-time unlock entitlement (migration 0043). Fails CLOSED: a database error
 * means "not unlocked" (and is logged); the UI offers a retry for a user who has just paid.
 */
export async function isAnalysisUnlocked(analysisId: string, userId: string): Promise<boolean> {
  try {
    const service = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (service as any)
      .from("analysis_unlocks")
      .select("status")
      .eq("analysis_id", analysisId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[unlocks] lookup failed (treated as locked):", error.message);
      return false;
    }
    return (data as { status?: string } | null)?.status === "paid";
  } catch (e) {
    console.warn("[unlocks] lookup threw (treated as locked):", (e as Error).message);
    return false;
  }
}

/**
 * Does this viewer get the FULL report of THIS audit? One call for the report page, the polling route,
 * Fix Tracks and the Growth Map, so none of them re-derives it from the plan alone.
 * With REPORT_UNLOCK off (the default) this is exactly `plan !== "free"`.
 */
export async function resolveFullReport(p: {
  analysisId: string;
  userId: string;
  plan: string | null | undefined;
  /** Viewer email: lets the production test list (REPORT_UNLOCK_TEST_EMAILS) see the unlock while the flag is off. */
  email?: string | null;
}): Promise<boolean> {
  if (hasFullReport({ plan: p.plan })) return true;
  if (!reportUnlockEnabledFor(p.email)) return false;
  return hasFullReport({ plan: p.plan, unlocked: await isAnalysisUnlocked(p.analysisId, p.userId) });
}
