import { Lock } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { PaymentMarks } from "@/components/billing/payment-marks";

/**
 * "Guaranteed safe checkout" trust row (checkout brief §2).
 *
 * This lives in OUR page chrome, OUTSIDE the cross-origin Stripe iframe — it
 * is purely a static badge row. It does not enable anything; the real list of
 * accepted methods is lib/stripe/payment-method-types.ts, which the Stripe
 * session is created with and which the brand chips derive from, so this row
 * can't advertise a brand Stripe won't actually offer.
 *
 * Left-aligned: it renders in the checkout's LEFT column alongside the plan
 * summary and the "cancel anytime" trust copy, not under the Stripe iframe.
 *
 * The chips themselves are the shared, client-safe `PaymentMarks` (also used by
 * the marketing footer), so the wordmark SVG exists in exactly one place.
 */
export async function PaymentMethods() {
  const { t } = await getT();
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/40">
        <Lock className="size-3" aria-hidden="true" />
        {t("checkout.safePayments")}
      </p>
      <PaymentMarks className="mt-3" />
    </div>
  );
}
