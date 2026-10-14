import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * The ONLY way to charge or refund an audit credit (§R P0, migration 0042).
 *
 * Both run in Postgres, atomically:
 *   • charge  — `create_charged_analysis`: debits one credit (`credits - 1 where credits >= 1`) and creates
 *               the audit in the same transaction. Never negative, no read-modify-write.
 *   • refund  — `refund_analysis`: flips the audit queued|running|failed → refunded exactly ONCE and credits
 *               back what the ledger shows was charged — no matter who calls it (Inngest onFailure, the
 *               8-minute poller, the API) or how often. A second call returns false and changes nothing.
 *
 * A run that finishes after it was refunded keeps report AND credit; a DB trigger flags it
 * (`analyses.succeeded_after_refund`) so it can be counted.
 */
type Service = ReturnType<typeof createSupabaseServiceClient>;

export interface ChargeInput {
  userId: string;
  url: string | null;
  screenshotUrl?: string | null;
  persona?: unknown;
  cost?: number;
}

/** Returns the new audit id, or `null` when the user has not enough credits (nothing was charged). */
export async function chargeAndCreateAnalysis(service: Service, input: ChargeInput): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (service as any).rpc("create_charged_analysis", {
    p_user: input.userId,
    p_url: input.url,
    p_screenshot_url: input.screenshotUrl ?? null,
    p_persona: input.persona ?? null,
    p_cost: input.cost ?? 1,
  });
  if (error) throw new Error(`create_charged_analysis: ${error.message}`);
  return (data as string | null) ?? null;
}

/** Refunds an audit at most once. Returns true only for the call that performed the refund. */
export async function refundAnalysis(service: Service, analysisId: string, error?: string | null): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: rpcErr } = await (service as any).rpc("refund_analysis", {
    p_analysis: analysisId,
    p_error: error ?? null,
  });
  if (rpcErr) throw new Error(`refund_analysis: ${rpcErr.message}`);
  return data === true;
}
