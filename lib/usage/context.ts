import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PlanTier } from "@/lib/supabase/types";

/**
 * Metering context carried implicitly from an entry point (server action,
 * Inngest function, REST route) down to the AI provider, so EVERY Gemini /
 * Claude call can be attributed to a user + feature WITHOUT threading params
 * through every agent. Uses Node's built-in AsyncLocalStorage — no new dep.
 */
export type MeterContext = {
  userId?: string | null;
  plan?: PlanTier | null;
  /** Feature label, e.g. 'analyzer' | 'meta_ads' | 'trend_refresh'. */
  eventType: string;
  /** Extra context merged into usage_events.meta (e.g. { analysisId }). */
  meta?: Record<string, unknown>;
};

const storage = new AsyncLocalStorage<MeterContext>();

/** Run `fn` with a metering context active for all nested AI calls. */
export function runWithMeter<T>(ctx: MeterContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Read the active metering context (undefined if none is set). */
export function getMeterContext(): MeterContext | undefined {
  return storage.getStore();
}

/**
 * Set the metering context for the remainder of the current execution and all
 * following async continuations, WITHOUT wrapping a callback. Ideal for entry
 * points (e.g. an Inngest function handler) where wrapping the whole body is
 * awkward — call this once at the top.
 */
export function enterMeter(ctx: MeterContext): void {
  storage.enterWith(ctx);
}
