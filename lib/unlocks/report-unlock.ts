/**
 * Who may read the full report of ONE audit.
 *
 * The single decision point shared by the report page, the polling route and every other path that serves
 * an `analyses` row to a browser (brief oct-2026 §4.2). Pure on purpose.
 *
 * `unlocked` comes from the one-time unlock table (migration 0043; see entitlement.ts) — and only while the
 * REPORT_UNLOCK flag is on. A paid plan always has the full report; a $7 unlock gives it for ONE audit and
 * nothing else (no publishing, no Optimizer, no new audits — those stay plan features).
 */

/** Price of one report unlock, in USD cents. Lives in code, not in a Stripe dashboard Price or an env var. */
export const REPORT_UNLOCK_USD_CENTS = 700;

/** `metadata.purchase` on the Checkout Session / PaymentIntent of an unlock. */
export const REPORT_UNLOCK_PURCHASE = "report_unlock";

export function hasFullReport(viewer: { plan: string | null | undefined; unlocked?: boolean }): boolean {
  return (viewer.plan != null && viewer.plan !== "free") || viewer.unlocked === true;
}
