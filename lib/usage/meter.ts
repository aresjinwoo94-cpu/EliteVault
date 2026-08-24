import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getMeterContext } from "./context";
import type { PlanTier } from "@/lib/supabase/types";

/**
 * ESTIMATED model pricing in USD per 1M tokens — for internal COGS visibility
 * ONLY, never for billing. Update if Google/Anthropic change prices. Matched
 * by prefix so dated model suffixes still resolve.
 */
// NOTE: matched by PREFIX (first key that `model.startsWith(...)` wins), so
// order matters — more specific keys must come BEFORE their shorter prefixes
// (e.g. "gemini-2.5-flash-lite" before "gemini-2.5-flash", "claude-opus-4-8"
// before "claude-opus"). Prices are per 1M tokens, USD, July 2026.
const PRICING: Record<string, { inPer1M: number; outPer1M: number }> = {
  "gemini-2.5-pro": { inPer1M: 1.25, outPer1M: 10.0 },
  "gemini-2.5-flash-lite": { inPer1M: 0.1, outPer1M: 0.4 },
  "gemini-2.5-flash": { inPer1M: 0.3, outPer1M: 2.5 },
  "claude-opus": { inPer1M: 5.0, outPer1M: 25.0 },
  "claude-sonnet": { inPer1M: 3.0, outPer1M: 15.0 },
  "claude-haiku": { inPer1M: 1.0, outPer1M: 5.0 },
};

function estimateCostUsd(
  model: string | undefined,
  promptTokens: number,
  outputTokens: number,
): number {
  if (!model) return 0;
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  if (!key) return 0;
  const p = PRICING[key];
  return (
    (promptTokens / 1_000_000) * p.inPer1M +
    (outputTokens / 1_000_000) * p.outPer1M
  );
}

export type UsageRecord = {
  model?: string;
  provider?: string;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Override the ALS context if needed. */
  eventType?: string;
  userId?: string | null;
  plan?: PlanTier | null;
  meta?: Record<string, unknown>;
  /**
   * Cost supplied by the caller, for work that ISN'T an inference call.
   *
   * The pricing table above is keyed by model, so anything that doesn't burn
   * tokens — Liquid Blocks' headless browser is the first — estimates to zero
   * and disappears from the ledger it belongs in. This lets such a caller state
   * its own figure.
   *
   * Deliberately an explicit opt-in rather than a fallback: an AI call whose
   * model is missing from PRICING should keep reporting 0 and be fixed by
   * adding the model, not by having some other number quietly substituted.
   */
  estCostUsdOverride?: number;
};

/**
 * Record one inference call into `usage_events`.
 *
 * FIRE-AND-FORGET and strictly best-effort: it must NEVER throw or block the
 * caller. Losing a metering row is acceptable; breaking a user's audit is not.
 * Inserts run with the service client (RLS-bypassing) because the client must
 * never be able to forge cost rows.
 */
export function recordUsage(rec: UsageRecord): void {
  void recordUsageNow(rec);
}

/**
 * The same write, but awaitable — for callers whose insert would otherwise be
 * the LAST thing a serverless invocation does.
 *
 * `recordUsage` detaches the insert and returns immediately, which is right for
 * an AI call: more work always follows it, so the promise has time to flush.
 * It is wrong for the final statement of a request or an Inngest step. There
 * the handler returns, the platform answers, and the instance may be frozen
 * before a real network round-trip completes — so the one row a feature exists
 * to write becomes the row most likely to be dropped. That is exactly the shape
 * of Liquid Blocks' headless-browser cost.
 *
 * NEVER REJECTS. Awaiting it cannot fail the caller, which is what makes it
 * safe to use inside a `finally` where a throw would mask the real error.
 */
export async function recordUsageNow(rec: UsageRecord): Promise<void> {
  const ctx = getMeterContext();
  const eventType = rec.eventType ?? ctx?.eventType ?? "other";
  const userId = rec.userId ?? ctx?.userId ?? null;
  const plan = rec.plan ?? ctx?.plan ?? null;
  const promptTokens = Math.max(0, Math.round(rec.promptTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(rec.outputTokens ?? 0));
  const totalTokens = Math.max(
    0,
    Math.round(rec.totalTokens ?? promptTokens + outputTokens),
  );
  const estCost =
    typeof rec.estCostUsdOverride === "number" &&
    Number.isFinite(rec.estCostUsdOverride) &&
    rec.estCostUsdOverride >= 0
      ? rec.estCostUsdOverride
      : estimateCostUsd(rec.model, promptTokens, outputTokens);
  const meta = { ...(ctx?.meta ?? {}), ...(rec.meta ?? {}) };

  try {
    const service = createSupabaseServiceClient();
    await service.from("usage_events").insert({
      user_id: userId,
      plan,
      event_type: eventType,
      model: rec.model ?? null,
      provider: rec.provider ?? "gemini",
      prompt_tokens: promptTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      est_cost_usd: Number(estCost.toFixed(6)),
      meta,
    });
  } catch (err) {
    // Never surface — metering is non-critical.
    //
    // String(err) rather than (err as Error).message: a non-Error throw would
    // make the CATCH itself throw, and this function's whole contract is that
    // it cannot. Inside a `finally` that would mask the real failure.
    console.warn("[meter] failed to record usage:", String(err));
  }
}
