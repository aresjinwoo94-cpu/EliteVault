/**
 * Pure decision logic for the abandoned-checkout recovery sequence — no DB, no
 * email, no `server-only` imports, so it's unit-testable in isolation. The
 * Inngest function (inngest/functions/checkout-recovery.ts) gathers state from
 * Supabase, calls decideRecoveryAction, and performs the resulting side effect.
 */

export type RecoveryState = {
  /** profiles.plan for the user (default 'free'). */
  currentPlan: string;
  /** Any subscription in status 'active' | 'trialing'. */
  hasActiveSubscription: boolean;
  /** checkout_recovery.status, or null if the row is gone. */
  rowStatus: "pending" | "recovered" | "unsubscribed" | null;
  /** checkout_recovery.emails_sent (0..3). */
  emailsSent: number;
};

export type RecoveryDecision =
  | { action: "stop"; recovered: boolean; reason: string }
  | { action: "skip"; reason: string } // this step already sent; continue sequence
  | { action: "send"; reason: string };

/**
 * Decide what to do for step `stepNo` (1|2|3) given the user's current state.
 * Conversion (paid plan or active/trialing sub) or an unsubscribe stops the
 * whole sequence; a step already recorded is skipped (idempotent); otherwise
 * the reminder is due.
 */
export function decideRecoveryAction(
  state: RecoveryState,
  stepNo: number,
): RecoveryDecision {
  if (state.currentPlan && state.currentPlan !== "free") {
    return { action: "stop", recovered: true, reason: "recovered_plan" };
  }
  if (state.hasActiveSubscription) {
    return { action: "stop", recovered: true, reason: "recovered_subscription" };
  }
  if (state.rowStatus === null) {
    return { action: "stop", recovered: false, reason: "no_row" };
  }
  if (state.rowStatus === "unsubscribed") {
    return { action: "stop", recovered: false, reason: "unsubscribed" };
  }
  if (state.rowStatus === "recovered") {
    return { action: "stop", recovered: false, reason: "already_recovered" };
  }
  if (state.emailsSent >= stepNo) {
    return { action: "skip", reason: "already_sent" };
  }
  return { action: "send", reason: "due" };
}
