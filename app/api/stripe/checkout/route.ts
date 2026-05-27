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

  // v3.8.3 — switched from Hosted Checkout (ui_mode default) to Embedded
  // Checkout (ui_mode: "embedded"). The session now returns a
  // `client_secret` that the client-side EmbeddedCheckout component
  // mounts inside our dark-themed wrapper at /app/checkout. Stripe still
  // owns PCI compliance + the actual payment form, but we own the
  // surrounding page chrome.
  //
  // success_url/cancel_url are replaced by a single return_url that
  // both successful and canceled checkouts hit. We disambiguate in
  // /app/checkout/return based on the retrieved session's status.
  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    return_url: absoluteUrl(
      "/app/checkout/return?session_id={CHECKOUT_SESSION_ID}",
    ),
    allow_promotion_codes: true,
    billing_address_collection: "auto",

    // Locale follows the user's browser language.
    locale: "auto",

    // Embedded checkout still respects custom_text. Less critical now
    // that the page is fully ours, but keeps the upgrade-context copy
    // consistent if Stripe shows it.
    custom_text: {
      submit: {
        message: `You're upgrading to EliteVault ${planLabel}. ${trialLine}`,
      },
    },

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

  return NextResponse.json({ client_secret: session.client_secret });
}
