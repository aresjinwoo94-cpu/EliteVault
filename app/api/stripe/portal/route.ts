import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveStripeCustomerId } from "@/lib/stripe/customer";
import { absoluteUrl } from "@/lib/utils";

/**
 * Stripe Customer Portal session creator (v3.9.5 — bulletproof error handling).
 *
 * Two failure modes addressed since this last shipped:
 *
 *   1. NO try/catch → Stripe SDK throws → empty 500 → client's
 *      `await res.json()` blows up with "Unexpected end of JSON input".
 *   2. stripe_customer_id in the profile was created in TEST mode but
 *      we're now using a LIVE secret key → Stripe responds with
 *      "No such customer" → same empty 500 path.
 *
 * Fixed by:
 *   • Wrapping the whole handler in try/catch
 *   • Surfacing Stripe error messages cleanly in the response body
 *   • Telling the user (via the error response) when their customer
 *     record is stale so the UI can prompt a re-checkout
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    const p = profile as {
      stripe_customer_id?: string | null;
      email?: string | null;
    } | null;

    // Auto-heal a stale/missing customer id (Test→Live footgun) instead of
    // hard-failing with stale_customer — mirrors the checkout route.
    const customerId = await resolveStripeCustomerId({
      userId: user.id,
      email: p?.email ?? user.email ?? null,
      storedId: p?.stripe_customer_id ?? null,
    });
    if (!customerId) {
      return NextResponse.json(
        {
          error: "no_customer",
          detail:
            "No billing record found for your account. Start a checkout from the pricing page to set up your subscription.",
        },
        { status: 400 },
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: absoluteUrl("/app/billing"),
      locale: "auto",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "portal_failed";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (err as any)?.code as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripeMessage = (err as any)?.raw?.message as string | undefined;

    // Special case: stripe_customer_id points to a customer that doesn't
    // exist in the current Stripe mode (usually after a Test→Live key
    // switch). Tell the client so the UI can prompt a fresh checkout
    // instead of a generic error toast.
    if (code === "resource_missing") {
      return NextResponse.json(
        {
          error: "stale_customer",
          detail:
            "Your billing record needs to be refreshed. Start a fresh checkout from the pricing page — your plan will be re-attached.",
        },
        { status: 409 },
      );
    }

    // The Customer Portal must be activated once in the Stripe Dashboard
    // (Settings → Billing → Customer portal) per mode. Until then Stripe
    // throws this — surface it clearly instead of a raw 500.
    if (/configuration/i.test(stripeMessage ?? msg)) {
      return NextResponse.json(
        {
          error: "portal_not_configured",
          detail:
            "The Stripe Customer Portal isn't set up yet. Activate it in Stripe → Settings → Billing → Customer portal (in Live mode).",
        },
        { status: 409 },
      );
    }

    console.error("[stripe/portal] failed:", { msg, code, stripeMessage });
    return NextResponse.json(
      { error: code ?? "portal_failed", detail: stripeMessage ?? msg },
      { status: 500 },
    );
  }
}
