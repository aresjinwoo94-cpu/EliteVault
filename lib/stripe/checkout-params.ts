import type Stripe from "stripe";
import type { Locale } from "@/lib/i18n/config";
import { translator } from "@/lib/i18n/messages";
import { absoluteUrl } from "@/lib/utils";

/**
 * The language Stripe renders Checkout / Billing Portal in.
 *
 * ALWAYS the site's own language, never Stripe's `"auto"`. `"auto"` follows the
 * browser, so a visitor whose browser is Spanish but whose EliteVault is in
 * English got our half of the checkout in English and Stripe's half (the form,
 * Link, the coupon field) in Spanish. Stripe also formats the amount and the
 * currency with this locale; WHICH currency is charged is still Adaptive
 * Pricing's call (buyer's country), which is unaffected.
 */
export function stripeLocale(locale: Locale): "en" | "es" {
  return locale === "es" ? "es" : "en";
}

/**
 * Everything of the embedded Checkout Session except the per-session theme
 * (`branding_settings`, applied by checkout-session.ts) — pure, so the locale
 * contract is unit-testable without Stripe or Supabase.
 */
export function buildCheckoutSessionParams({
  customerId,
  price,
  userId,
  plan,
  interval,
  locale,
}: {
  customerId: string;
  price: string;
  userId: string;
  plan: "pro" | "scale";
  interval: "month" | "year";
  locale: Locale;
}): Stripe.Checkout.SessionCreateParams {
  const t = translator(locale);

  // Plan-aware copy that Stripe prints ABOVE/BELOW its own payment fields; it
  // is in the site's language like everything else around the form.
  const planLabel = plan === "pro" ? "Pro" : "Scale";
  const includes = t(
    plan === "scale" ? "checkout.stripeIncludesScale" : "checkout.stripeIncludesPro",
  );
  const submit = t("checkout.stripeSubmit")
    .replace("{plan}", planLabel)
    .replace("{includes}", includes);

  return {
    ui_mode: "embedded",
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],

    // Charge the buyer in their local currency. Stripe converts the USD price
    // at checkout based on the buyer's location and presents the local amount;
    // nothing else about the session changes (same price ID, payment methods,
    // metadata, branding, webhook). The webhook keys credits off plan/price
    // ID, never the amount/currency, so a local-currency charge grants the
    // same credits. Requires Adaptive Pricing to be enabled in the Stripe
    // Dashboard (Settings → Payments) for the mode being used.
    adaptive_pricing: { enabled: true },
    return_url: absoluteUrl(
      "/app/checkout/return?session_id={CHECKOUT_SESSION_ID}",
    ),
    allow_promotion_codes: true,
    billing_address_collection: "auto",

    // The site's language — never "auto" (see stripeLocale).
    locale: stripeLocale(locale),

    custom_text: {
      submit: { message: submit },
    },

    customer_update: {
      name: "auto",
      address: "auto",
    },

    subscription_data: {
      metadata: { supabase_user_id: userId, plan },
      description: `EliteVault ${planLabel} — ${interval === "year" ? "annual" : "monthly"} subscription`,
    },
    metadata: { supabase_user_id: userId, plan },
  };
}
