import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe/server";
import { getCheckoutPriceId } from "@/lib/stripe/plans";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/utils";

const Body = z.object({
  plan: z.enum(["pro", "scale"]),
  interval: z.enum(["month", "year"]),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { plan, interval } = parsed.data;

  const price = getCheckoutPriceId(plan, interval);
  if (!price) {
    return NextResponse.json(
      { error: "price_not_configured", detail: `Set STRIPE_PRICE_${plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "YEARLY"}` },
      { status: 500 },
    );
  }

  // Ensure Stripe customer exists (idempotent)
  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("stripe_customer_id, email, full_name")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      name: profile?.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await service
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // Plan-aware label so the checkout page reflects what they're buying.
  // Stripe shows the line-item name from the Price/Product config in the
  // Dashboard — these custom_text strings add EliteVault-specific copy
  // ABOVE and BELOW the standard payment fields.
  const planLabel = plan === "pro" ? "Pro" : "Scale";
  const trialLine =
    plan === "scale"
      ? "Includes Meta Campaign Scenario Modeler + Meta Ads optimizer + REST API."
      : "Includes the full Analyzer + Library + Community publishing.";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: absoluteUrl(
      "/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    ),
    cancel_url: absoluteUrl("/pricing?checkout=canceled"),
    allow_promotion_codes: true,
    billing_address_collection: "auto",

    // Auto-detect the user's browser locale (en/es/fr/etc.) instead of
    // forcing English. Stripe falls back to "en" if the locale isn't
    // supported. Massive UX win for Spanish-speaking users.
    locale: "auto",

    // Custom text shown to the user on the checkout page. These are the
    // ONLY copy slots Stripe gives us to brand the hosted page — we use
    // them to make the page feel like a continuation of EliteVault.
    custom_text: {
      submit: {
        message: `You're upgrading to EliteVault ${planLabel}. ${trialLine}`,
      },
      terms_of_service_acceptance: {
        message:
          "By subscribing you agree to EliteVault's [Terms](https://elitevault.app/terms) and [Privacy Policy](https://elitevault.app/privacy).",
      },
    },

    // Show the terms-of-service checkbox above the submit button so the
    // user explicitly acknowledges the terms link. This is required for
    // the terms_of_service_acceptance custom_text above to render.
    consent_collection: {
      terms_of_service: "required",
    },

    // Keep the Stripe customer's name/address in sync with what they
    // enter at checkout — so the customer record stays clean for our
    // billing emails + portal.
    customer_update: {
      name: "auto",
      address: "auto",
    },

    subscription_data: {
      metadata: { supabase_user_id: user.id, plan },
      description: `EliteVault ${planLabel} — ${interval === "year" ? "annual" : "monthly"} subscription`,
    },
    metadata: { supabase_user_id: user.id, plan },
  });

  return NextResponse.json({ url: session.url });
}
