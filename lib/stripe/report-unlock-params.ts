import type Stripe from "stripe";
import type { Locale } from "@/lib/i18n/config";
import { translator } from "@/lib/i18n/messages";
import { absoluteUrl } from "@/lib/utils";
import { CHECKOUT_PAYMENT_METHOD_TYPES } from "@/lib/stripe/payment-method-types";
import { stripeLocale } from "@/lib/stripe/checkout-params";
import { REPORT_UNLOCK_PURCHASE, REPORT_UNLOCK_USD_CENTS } from "@/lib/unlocks/report-unlock";

/**
 * Everything of the one-time "unlock this report" Checkout Session except the per-session theme — pure, so
 * the contract is unit-testable without Stripe (WP-3, brief oct-2026 §5.1).
 *
 * What it must NOT do (each is pinned by a test):
 *   • no `invoice_creation` — a one-time invoice would reach `onInvoicePaid`, which hard-sets credits and
 *     emails a "plan Free" receipt;
 *   • no `subscription_data`, no price from the Dashboard — the price lives in code;
 *   • no `checkout/started` recovery event (that sequence sells plans).
 * What it must do: Adaptive Pricing on (buyer's local currency), the site's language (never "auto"), the
 * shared payment-method list, and metadata on BOTH the session and its PaymentIntent.
 */
export function buildReportUnlockSessionParams({
  customerId,
  customerEmail,
  userId,
  analysisId,
  domain,
  locale,
}: {
  customerId: string | null;
  customerEmail: string | null;
  userId: string;
  analysisId: string;
  /** The audited store's domain, for the receipt/description and the copy under the pay button. */
  domain: string;
  locale: Locale;
}): Stripe.Checkout.SessionCreateParams {
  const t = translator(locale);
  const metadata = { purchase: REPORT_UNLOCK_PURCHASE, supabase_user_id: userId, analysis_id: analysisId };

  return {
    ui_mode: "embedded",
    mode: "payment",
    ...(customerId ? { customer: customerId } : customerEmail ? { customer_email: customerEmail } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: REPORT_UNLOCK_USD_CENTS,
          product_data: { name: "EliteVault: full report unlock", description: domain.slice(0, 120) },
        },
      },
    ],
    // Local currency for the buyer's country (needs Adaptive Pricing enabled in the Dashboard).
    adaptive_pricing: { enabled: true },
    payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
    locale: stripeLocale(locale),
    return_url: absoluteUrl("/app/unlock/return?session_id={CHECKOUT_SESSION_ID}"),
    billing_address_collection: "auto",
    custom_text: { submit: { message: t("unlock.submit").replace("{domain}", domain) } },
    metadata,
    payment_intent_data: {
      metadata,
      description: `EliteVault report unlock: ${domain}`,
    },
    // Reusing the buyer's Stripe customer keeps their Link/wallet details; a fresh email-only session is fine too.
    ...(customerId ? { customer_update: { name: "auto", address: "auto" } } : {}),
  };
}
