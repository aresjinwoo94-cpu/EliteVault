/**
 * Wall-clock budgets for work that runs inside a serverless function.
 *
 * # Why this exists
 * The analyzer runs as an Inngest pipeline, and EVERY Inngest step is a
 * separate invocation of `app/api/inngest/route.ts`, whose `maxDuration` is
 * 60s (the Vercel Hobby maximum — a higher value fails the build there). When
 * a step runs longer than that, Vercel kills the request and answers 504.
 * Inngest reports it as:
 *
 *     "Your server returned HTTP 504 before the SDK responded."
 *
 * …which is what the analyzer has been failing/refunding with. The step didn't
 * *fail*, it was *cut off* — so the error is opaque, the partial work is lost,
 * and the retry starts from zero with the same unbounded budget.
 *
 * The cut-off is not caused by one slow call. It's caused by the retry and
 * back-off ladders NESTED inside a step being unaware of the ceiling above
 * them: the Gemini provider alone can sleep 8s × 2 for a 503, 1.5s × 2 for an
 * empty response, up to 70s waiting for an API key cooldown, and then repeat
 * the whole ladder on the fallback model. Any one of those is reasonable in
 * isolation; together they exceed 60s long before the model is the problem.
 *
 * # The rule
 * A step must decide for itself when to stop, slightly BEFORE the platform
 * decides for it. A `Deadline` carries the wall-clock instant the step has to
 * be done by, so every nested wait can ask "do I still have room for this?"
 * and fail cleanly instead of being killed. A clean failure is retryable by
 * Inngest with a fresh 60s; a 504 is not usefully retryable.
 *
 * Nothing here is analyzer-specific — any long serverless step can use it.
 */

/**
 * Budget for one Inngest step, in ms. Deliberately below the route's
 * `maxDuration` (60s) so we throw first and Vercel never has to 504.
 *
 * The ~10s of headroom covers what a step does AROUND the bounded call:
 * fetching the screenshot bytes, uploading to storage, and the Supabase
 * writes. Raise ANALYZER_STEP_BUDGET_MS together with `maxDuration` in
 * app/api/inngest/route.ts if the project moves to Vercel Pro (300s).
 */
export const STEP_BUDGET_MS = (() => {
  const raw = Number(process.env.ANALYZER_STEP_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 50_000;
})();

/**
 * Thrown when a step gives up because its remaining budget can't cover the
 * next unit of work. Distinct from a provider error on purpose: it means
 * "there wasn't time", not "the provider is broken", and callers use that to
 * decide whether a fallback attempt is even worth starting.
 */
export class DeadlineExceededError extends Error {
  readonly label: string;
  constructor(label: string) {
    super(`Step budget exhausted (${label}) — not enough time left to finish.`);
    this.name = "DeadlineExceededError";
    this.label = label;
  }
}

export function isDeadlineError(err: unknown): boolean {
  return (
    err instanceof DeadlineExceededError ||
    /step budget exhausted/i.test(
      err instanceof Error ? err.message : String(err ?? ""),
    )
  );
}

export interface Deadline {
  /** Absolute epoch-ms instant the work must be finished by. */
  readonly at: number;
  /** Milliseconds left (never negative). */
  remaining(): number;
  /** True once the budget is spent. */
  expired(): boolean;
  /** True when at least `ms` of budget remains — ask BEFORE starting work. */
  has(ms: number): boolean;
  /**
   * An AbortSignal that fires when the budget runs out, optionally capped so a
   * single call can't eat the whole remaining budget. Merges an outer signal
   * (e.g. a user cancel) when given.
   */
  signal(opts?: { capMs?: number; parent?: AbortSignal }): AbortSignal;
  /**
   * Sleep, but only if it fits inside the budget. Returns false WITHOUT
   * sleeping when it doesn't — the caller should then skip that retry rather
   * than burn the remaining time on a wait it can't act on.
   */
  sleep(ms: number): Promise<boolean>;
  /** Throw DeadlineExceededError if the budget is already gone. */
  assert(label: string): void;
}

function make(at: number): Deadline {
  const remaining = () => Math.max(0, at - Date.now());
  return {
    at,
    remaining,
    expired: () => remaining() <= 0,
    has: (ms: number) => remaining() >= ms,
    signal({ capMs, parent } = {}) {
      const ms = Math.max(1, capMs ? Math.min(capMs, remaining()) : remaining());
      // An "infinite" budget (no deadlineAt passed) exceeds the 32-bit timer
      // range, where setTimeout silently clamps to 1ms and would abort the
      // call instantly. Treat it as no timeout at all.
      if (ms > 2_147_483_000) return parent ?? new AbortController().signal;
      const own = AbortSignal.timeout(ms);
      // AbortSignal.any is Node 20+ / modern runtimes; guard so a missing impl
      // degrades to the budget signal instead of throwing.
      if (!parent) return own;
      return typeof AbortSignal.any === "function"
        ? AbortSignal.any([parent, own])
        : own;
    },
    async sleep(ms: number) {
      // Keep a small margin so we don't wake up with zero time to act.
      if (remaining() < ms + 1_000) return false;
      await new Promise((r) => setTimeout(r, ms));
      return true;
    },
    assert(label: string) {
      if (remaining() <= 0) throw new DeadlineExceededError(label);
    },
  };
}

/** Start a budget of `budgetMs` from now (defaults to one Inngest step). */
export function startDeadline(budgetMs: number = STEP_BUDGET_MS): Deadline {
  return make(Date.now() + Math.max(0, budgetMs));
}

/**
 * Rebuild a Deadline from an absolute instant. Used to pass a budget across a
 * function boundary as a plain number (a class instance can't cross an Inngest
 * step output, but an epoch-ms number can).
 */
export function deadlineAt(at: number): Deadline {
  return make(at);
}
