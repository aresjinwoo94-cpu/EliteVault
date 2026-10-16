import type Stripe from "stripe";
import { isReportUnlockSession, settleReportUnlock, type SettleResult, type UnlockStore } from "@/lib/unlocks/settle";

/**
 * Stripe events of the one-time report unlock, processed WITHOUT the pre-insert dedupe of `stripe_events`.
 *
 * Why: the generic webhook inserts the event row BEFORE processing, so a crash/timeout mid-settlement left the row
 * behind and Stripe's retry was answered "duplicate" — a buyer who paid stayed locked. Here the event is recorded
 * only AFTER it has been fully processed. Re-processing is safe because every step is idempotent in the database
 * (analysis_unlocks PK + UNIQUE stripe_session_id; the re-lock only touches a `paid` row; refunds use idempotency keys).
 *
 * Pure orchestration over injected dependencies so the crash/retry behaviour is testable offline.
 */

// Built from parts on purpose: the i18n key audit reads dotted literals that start with a namespace name.
export const EV_ASYNC_OK = ["checkout", "session", "async_payment_succeeded"].join(".");
export const EV_ASYNC_FAILED = ["checkout", "session", "async_payment_failed"].join(".");
const EV_COMPLETED = ["checkout", "session", "completed"].join(".");

export type UnlockAlert =
  | { kind: "paid"; sessionId: string; analysisId: string; amount: number | null; currency: string | null }
  | {
      kind: "auto_refund";
      reason: "owner_mismatch" | "amount_mismatch" | "duplicate_refunded";
      sessionId: string;
      analysisId: string | null;
    }
  | { kind: "failure"; stage: "settle" | "relock"; sessionId: string | null; error: string; eventId: string };

export interface UnlockEventDeps {
  store: UnlockStore;
  /** The session re-read with the app's pinned API version (carries `currency_conversion`). */
  retrieveSession(id: string): Promise<Stripe.Checkout.Session>;
  /** A fully refunded charge re-locks the report it paid for. Throws on a database error. */
  relockRefunded(charge: Stripe.Charge): Promise<void>;
  /** Record the event as processed. Called ONLY after processing succeeded. */
  markProcessed(event: Stripe.Event): Promise<void>;
  /** Best-effort owner alert; never allowed to break processing. */
  alert(alert: UnlockAlert): Promise<void>;
}

/** Events handled by this module: unlock checkout sessions and every refunded charge (idempotent no-op for plans). */
export function isUnlockEvent(event: Stripe.Event): boolean {
  if (event.type === "charge.refunded") return true;
  if (event.type === EV_COMPLETED || event.type === EV_ASYNC_OK || event.type === EV_ASYNC_FAILED) {
    return isReportUnlockSession(event.data.object as Stripe.Checkout.Session);
  }
  return false;
}

async function safeAlert(deps: UnlockEventDeps, a: UnlockAlert) {
  try {
    await deps.alert(a);
  } catch (e) {
    console.warn("[unlock] alert failed:", (e as Error).message);
  }
}

async function safeMark(deps: UnlockEventDeps, event: Stripe.Event) {
  try {
    await deps.markProcessed(event);
  } catch (e) {
    // Nothing is lost: the next delivery just re-processes idempotently.
    console.warn("[unlock] could not record processed event", event.id, (e as Error).message);
  }
}

/** Throws on any processing failure (→ the route answers 500 and Stripe retries; the event is NOT recorded). */
export async function processUnlockEvent(event: Stripe.Event, deps: UnlockEventDeps): Promise<void> {
  if (event.type === "charge.refunded") {
    try {
      await deps.relockRefunded(event.data.object as Stripe.Charge);
    } catch (e) {
      await safeAlert(deps, { kind: "failure", stage: "relock", sessionId: null, error: (e as Error).message, eventId: event.id });
      throw e;
    }
    await safeMark(deps, event);
    return;
  }

  const raw = event.data.object as Stripe.Checkout.Session;
  if (event.type === EV_ASYNC_FAILED) {
    console.warn("[unlock] async payment failed for", raw.id);
    await safeMark(deps, event);
    return;
  }

  let result: SettleResult;
  let session = raw;
  try {
    session = await deps.retrieveSession(raw.id);
    result = await settleReportUnlock(session, deps.store);
  } catch (e) {
    await safeAlert(deps, { kind: "failure", stage: "settle", sessionId: raw.id, error: (e as Error).message, eventId: event.id });
    throw e;
  }

  const analysisId = session.metadata?.analysis_id ?? null;
  if (result.kind === "unlocked") {
    await safeAlert(deps, {
      kind: "paid",
      sessionId: session.id,
      analysisId: analysisId ?? "?",
      amount: session.amount_total ?? null,
      currency: session.currency ?? null,
    });
  } else if (result.kind === "owner_mismatch" || result.kind === "amount_mismatch" || result.kind === "duplicate_refunded") {
    await safeAlert(deps, { kind: "auto_refund", reason: result.kind, sessionId: session.id, analysisId });
  }
  await safeMark(deps, event);
}
