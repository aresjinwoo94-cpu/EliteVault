import type { UnlockAlert } from "@/lib/unlocks/process-event";

/** Pure content of the owner alerts (kept apart from the sender so it can be tested without server-only code). */

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return "unknown amount";
  return `${(amount / 100).toFixed(2)} ${(currency ?? "?").toUpperCase()}`;
}

const REASONS: Record<string, string> = {
  owner_mismatch: "the payer is not the owner of the audit (or metadata is missing)",
  amount_mismatch: "the amount is not the US$7.00 unlock price",
  duplicate_refunded: "that audit was already unlocked by another payment",
};

const stripeLink = (sessionId: string | null) =>
  sessionId?.startsWith("cs_test_") ? "https://dashboard.stripe.com/test/payments" : "https://dashboard.stripe.com/payments";

export function buildUnlockAlert(a: UnlockAlert, domain: string | null): { subject: string; lines: string[] } {
  if (a.kind === "paid") {
    return {
      subject: `Unlock paid: ${domain ?? a.analysisId} — ${formatMoney(a.amount, a.currency)}`,
      lines: [
        `Domain: ${domain ?? "?"}`,
        `Amount: ${formatMoney(a.amount, a.currency)}`,
        `Audit: ${a.analysisId}`,
        `Session: ${a.sessionId}`,
        `Stripe: ${stripeLink(a.sessionId)}`,
      ],
    };
  }
  if (a.kind === "auto_refund") {
    return {
      subject: `ACTION: unlock auto-refunded (${a.reason}) — ${a.sessionId}`,
      lines: [
        `The payment was refunded automatically: ${REASONS[a.reason] ?? a.reason}.`,
        `Domain: ${domain ?? "?"}`,
        `Audit: ${a.analysisId ?? "?"}`,
        `Session: ${a.sessionId}`,
        `Stripe: ${stripeLink(a.sessionId)}`,
      ],
    };
  }
  return {
    subject: `ACTION: unlock ${a.stage === "settle" ? "settlement" : "re-lock"} FAILED — ${a.sessionId ?? a.eventId}`,
    lines: [
      a.stage === "settle"
        ? "A buyer may have paid and NOT been unlocked (or an automatic refund failed). Stripe will retry; resolve by hand if it keeps failing."
        : "A refund did not re-lock its report. Stripe will retry.",
      `Error: ${a.error}`,
      `Session: ${a.sessionId ?? "(n/a)"}`,
      `Event: ${a.eventId}`,
      `Stripe: ${stripeLink(a.sessionId)}`,
    ],
  };
}
