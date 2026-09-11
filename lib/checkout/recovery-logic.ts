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
  /**
   * Another sequence for the same user started within SEQUENCE_WINDOW_MS
   * BEFORE this one, so that older sequence owns the reminders.
   */
  supersededByOlderSequence: boolean;
  /** The user unsubscribed from ANY of their recovery sequences. */
  unsubscribedElsewhere: boolean;
};

export type RecoveryDecision =
  | { action: "stop"; recovered: boolean; reason: string }
  | { action: "skip"; reason: string } // this step already sent; continue sequence
  | { action: "send"; reason: string };

/** Full span of one sequence: 1h + 23h + 48h. */
export const SEQUENCE_WINDOW_MS = 72 * 60 * 60 * 1000;

export type SiblingSequence = {
  session_id: string;
  status: string;
  created_at: string;
};

/**
 * Send-time dedupe across a user's sequences. Every render of /app/checkout
 * used to open a new Stripe session → a new sequence, so one user could hold
 * many overlapping sequences, each emailing on its own clock. The emit guard in
 * lib/stripe/checkout-session.ts stops NEW duplicates; this stops the ones
 * already sleeping in Inngest (and any that race past the emit guard).
 *
 * Rule: the OLDEST of any overlapping sequences wins. A sequence is superseded
 * when another one for the same user started up to SEQUENCE_WINDOW_MS before
 * it. Measured from this sequence's own created_at — not from now — so the
 * verdict can't flip between steps. Equal timestamps tie-break on session_id,
 * so exactly one of the pair survives.
 *
 * Unsubscribe is per session in the route, but the promise on the page is "no
 * more checkout reminders", so an unsubscribe on ANY sibling stops this one too.
 */
export function summarizeSiblingSequences(
  current: { sessionId: string; createdAt: string },
  siblings: SiblingSequence[],
): Pick<RecoveryState, "supersededByOlderSequence" | "unsubscribedElsewhere"> {
  const mine = Date.parse(current.createdAt);
  let supersededByOlderSequence = false;
  let unsubscribedElsewhere = false;

  for (const s of siblings) {
    if (s.session_id === current.sessionId) continue;
    if (s.status === "unsubscribed") unsubscribedElsewhere = true;

    const theirs = Date.parse(s.created_at);
    if (Number.isNaN(mine) || Number.isNaN(theirs)) continue;
    const older =
      theirs < mine || (theirs === mine && s.session_id < current.sessionId);
    if (older && mine - theirs <= SEQUENCE_WINDOW_MS) {
      supersededByOlderSequence = true;
    }
  }

  return { supersededByOlderSequence, unsubscribedElsewhere };
}

/**
 * Decide what to do for step `stepNo` (1|2|3) given the user's current state.
 * Conversion (paid plan or active/trialing sub) or an unsubscribe (on this or
 * any sibling sequence) stops the whole sequence, as does an older overlapping
 * sequence for the same user; a step already recorded is skipped (idempotent);
 * otherwise the reminder is due.
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
  if (state.rowStatus === "unsubscribed" || state.unsubscribedElsewhere) {
    return { action: "stop", recovered: false, reason: "unsubscribed" };
  }
  if (state.rowStatus === "recovered") {
    return { action: "stop", recovered: false, reason: "already_recovered" };
  }
  if (state.supersededByOlderSequence) {
    return { action: "stop", recovered: false, reason: "superseded" };
  }
  if (state.emailsSent >= stepNo) {
    return { action: "skip", reason: "already_sent" };
  }
  return { action: "send", reason: "due" };
}
