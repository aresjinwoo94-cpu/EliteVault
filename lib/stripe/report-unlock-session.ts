import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveStripeCustomerId } from "@/lib/stripe/customer";
import { DARK_CHECKOUT_BRANDING, isBrandingRejection } from "@/lib/stripe/checkout-session";
import { buildReportUnlockSessionParams } from "@/lib/stripe/report-unlock-params";
import type { Locale } from "@/lib/i18n/config";

/**
 * Embedded Checkout session for the one-time report unlock (WP-3, brief oct-2026 §5.1).
 * Same shape as `createEmbeddedCheckoutSession`: NEVER THROWS (the page hands the promise to a client
 * component; a rejection crossing that boundary would take the page down) — a discriminated union keeps
 * every failure renderable. It does not emit `checkout/started`: the abandoned-checkout emails sell plans.
 */
export type UnlockSessionResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; detail: string };

export async function createReportUnlockSession(p: {
  userId: string;
  userEmail: string | null;
  analysisId: string;
  domain: string;
  locale: Locale;
}): Promise<UnlockSessionResult> {
  try {
    const service = createSupabaseServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", p.userId)
      .single();
    const prof = profile as { stripe_customer_id?: string | null; email?: string | null } | null;
    const email = prof?.email ?? p.userEmail ?? null;

    // A customer valid in the CURRENT Stripe mode, or none (then the session is created with the email only).
    let customerId: string | null = null;
    try {
      customerId = await resolveStripeCustomerId({ userId: p.userId, email, storedId: prof?.stripe_customer_id ?? null });
    } catch (err) {
      console.warn("[unlock] customer resolution failed, using email only:", (err as Error).message);
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      ...buildReportUnlockSessionParams({
        customerId,
        customerEmail: email,
        userId: p.userId,
        analysisId: p.analysisId,
        domain: p.domain,
        locale: p.locale,
      }),
      ...DARK_CHECKOUT_BRANDING,
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(params);
    } catch (err) {
      if (!isBrandingRejection(err)) throw err;
      // theming is a nicety; being able to pay is not
      console.warn("[unlock] branding_settings rejected — retrying without it");
      const withoutBranding = { ...params } as Record<string, unknown>;
      delete withoutBranding.branding_settings;
      session = await stripe.checkout.sessions.create(withoutBranding as unknown as Stripe.Checkout.SessionCreateParams);
    }

    if (!session.client_secret) {
      return { ok: false, error: "no_client_secret", detail: "Stripe didn't return a checkout session." };
    }
    return { ok: true, clientSecret: session.client_secret };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const detail = (err as { raw?: { message?: string } })?.raw?.message ?? (err instanceof Error ? err.message : "checkout_failed");
    console.error("[unlock] session creation failed:", { code, detail });
    return { ok: false, error: code ?? "checkout_failed", detail };
  }
}
