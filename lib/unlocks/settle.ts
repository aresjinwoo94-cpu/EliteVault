import type Stripe from "stripe";
import { REPORT_UNLOCK_PURCHASE } from "@/lib/unlocks/report-unlock";

/**
 * Settlement of a paid "unlock this report" Checkout Session (WP-2, brief oct-2026 §4.3).
 *
 * Called by BOTH the Stripe webhook and the return page — whichever arrives first wins and the other is a
 * no-op. Pure orchestration over an injected `UnlockStore` so every branch is testable offline; the real
 * store (service-role Supabase + Stripe refunds) is `createUnlockStore` in settle-store.ts.
 *
 * Idempotent by construction: `analysis_unlocks.analysis_id` is the primary key and `stripe_session_id` is
 * unique, so replays, two tabs paying two sessions, or webhook + return racing can never create two rows.
 */
export interface UnlockRow {
  analysis_id: string;
  user_id: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
}

export interface UnlockStore {
  /** `analyses.user_id` of the audit (null if it does not exist or is anonymous). */
  getAnalysisOwner(analysisId: string): Promise<string | null>;
  /** The existing unlock of an audit, if any. */
  getUnlock(analysisId: string): Promise<{ stripe_session_id: string; status: string } | null>;
  /** `insert … on conflict (analysis_id) do nothing`. */
  insertUnlock(row: UnlockRow): Promise<"inserted" | "conflict">;
  /** Refund a PaymentIntent in full. `key` is the Stripe idempotency key. */
  refundPaymentIntent(paymentIntentId: string, key: string): Promise<void>;
}

export type SettleResult =
  | { kind: "ignored" } // not an unlock session
  | { kind: "unpaid" } // async method still pending (or failed): nothing to grant yet
  | { kind: "owner_mismatch"; refunded: boolean }
  | { kind: "already_unlocked" } // the same session was settled before (replay / webhook + return)
  | { kind: "unlocked" }
  | { kind: "duplicate_refunded" }; // a DIFFERENT session already unlocked this audit → this payment refunded

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  return typeof pi === "string" ? pi : (pi?.id ?? null);
}

export function isReportUnlockSession(session: Pick<Stripe.Checkout.Session, "mode" | "metadata">): boolean {
  return session.mode === "payment" && session.metadata?.purchase === REPORT_UNLOCK_PURCHASE;
}

export async function settleReportUnlock(session: Stripe.Checkout.Session, store: UnlockStore): Promise<SettleResult> {
  if (!isReportUnlockSession(session)) return { kind: "ignored" };
  if (session.payment_status !== "paid") return { kind: "unpaid" };

  const userId = session.metadata?.supabase_user_id;
  const analysisId = session.metadata?.analysis_id;
  const pi = paymentIntentId(session);
  if (!userId || !analysisId) {
    // Metadata is written by OUR server when the session is created; if it is missing something is badly off.
    if (pi) await store.refundPaymentIntent(pi, `unlock-nometa-${session.id}`);
    console.error("[unlock] paid session without metadata — refunded", session.id);
    return { kind: "owner_mismatch", refunded: Boolean(pi) };
  }

  const owner = await store.getAnalysisOwner(analysisId);
  if (owner !== userId) {
    if (pi) await store.refundPaymentIntent(pi, `unlock-mismatch-${session.id}`);
    console.error("[unlock] owner mismatch — refunded", { session: session.id, analysisId });
    return { kind: "owner_mismatch", refunded: Boolean(pi) };
  }

  const row: UnlockRow = {
    analysis_id: analysisId,
    user_id: userId,
    stripe_session_id: session.id,
    stripe_payment_intent: pi,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? null,
  };
  if ((await store.insertUnlock(row)) === "inserted") return { kind: "unlocked" };

  const existing = await store.getUnlock(analysisId);
  if (existing?.stripe_session_id === session.id) return { kind: "already_unlocked" };

  // Another session already unlocked this audit (two tabs paid before either settled): never charge twice.
  if (pi) await store.refundPaymentIntent(pi, `unlock-duplicate-${session.id}`);
  console.warn("[unlock] duplicate_unlock_refunded", { session: session.id, analysisId });
  return { kind: "duplicate_refunded" };
}
