import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getMeterContext } from "./context";
import type { PlanTier } from "@/lib/supabase/types";

/**
 * ESTIMATED model pricing in USD per 1M tokens — for internal COGS visibility
 * ONLY, never for billing. Update if Google/Anthropic change prices. Matched
 * by prefix so dated model suffixes still resolve.
 */
const PRICING: Record<string, { inPer1M: number; outPer1M: number }> = {
  "gemini-2.5-pro": { inPer1M: 1.25, outPer1M: 10.0 },
  "gemini-2.5-flash": { inPer1M: 0.3, outPer1M: 2.5 },
  "claude-opus": { inPer1M: 15.0, outPer1M: 75.0 },
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
  const estCost = estimateCostUsd(rec.model, promptTokens, outputTokens);
  const meta = { ...(ctx?.meta ?? {}), ...(rec.meta ?? {}) };

  void (async () => {
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
      console.warn("[meter] failed to record usage:", (err as Error).message);
    }
  })();
}
