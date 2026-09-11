import "server-only";
import { stripe } from "@/lib/stripe/server";
import { getCheckoutPriceId } from "@/lib/stripe/plans";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/utils";
import { inngest } from "@/inngest/client";

/**
 * Embedded Checkout session creation, extracted from
 * app/api/stripe/checkout/route.ts so it can run in TWO places:
 *
 *   • the API route (unchanged contract), and
 *   • the /app/checkout page render itself, which is the point.
 *
 * Previously the only trigger was a client-side fetch on mount, so the whole
 * chain — auth, profile read, Stripe customer probe, session create — didn't
 * START until the JS bundle had downloaded, parsed and hydrated. Calling this
 * during the server render gets that work in flight at request time instead,
 * and the page streams the result into a Suspense boundary so the rest of the
 * checkout paints immediately.
 *
 * NEVER THROWS. The page hands the returned promise straight to a client
 * component, and a rejected promise crossing that boundary takes the page
 * down; a discriminated union keeps every failure renderable. The route maps
 * the same union back onto its original JSON shape and status codes.
 */

export type CheckoutSessionResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; detail: string; status: number };

export async function createEmbeddedCheckoutSession({
  userId,
  userEmail,
  plan,
  interval,
}: {
  userId: string;
  userEmail: string | null;
  plan: "pro" | "scale";
  interval: "month" | "year";
}): Promise<CheckoutSessionResult> {
  try {
    const price = getCheckoutPriceId(plan, interval);
    if (!price) {
      return {
        ok: false,
        error: "price_not_configured",
        detail: `Set STRIPE_PRICE_${plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "YEARLY"}`,
        status: 500,
      };
    }

    // Ensure Stripe customer exists (idempotent)
    const service = createSupabaseServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("stripe_customer_id, email, full_name")
      .eq("id", userId)
      .single();

    const p = profile as {
      stripe_customer_id?: string | null;
      email?: string | null;
      full_name?: string | null;
    } | null;

    let customerId = p?.stripe_customer_id ?? null;

    // v3.9.5 — auto-heal stale customer IDs. The profile may hold a
    // stripe_customer_id created in TEST mode that doesn't exist now that
    // we're using LIVE keys (or vice-versa). Probe the customer first; if
    // Stripe says resource_missing, drop the stale ID and create a fresh
    // customer below. Without this, the upgrade flow hard-fails for every
    // user whose customer was provisioned in the previous mode.
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        // Customers can be "deleted" without being missing; treat as stale too.
        if ((existing as { deleted?: boolean }).deleted) {
          customerId = null;
        }
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "resource_missing") {
          customerId = null;
        } else {
          throw err;
        }
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: p?.email ?? userEmail ?? undefined,
        name: p?.full_name ?? undefined,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      await service
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
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

    // v3.8.3 — Embedded Checkout (ui_mode: "embedded"). The session returns a
    // `client_secret` that the client-side EmbeddedCheckout component mounts
    // inside our dark-themed wrapper at /app/checkout. Stripe still owns PCI
    // compliance + the actual payment form; we own the surrounding chrome.
    //
    // success_url/cancel_url are replaced by a single return_url that both
    // successful and canceled checkouts hit. We disambiguate in
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

      // Explicit payment methods — Stripe SHOULD auto-detect from the
      // dashboard config, but for Embedded Checkout sessions some accounts
      // only show a subset (Amazon Pay + Link) unless we name the methods
      // explicitly. Including "card" enables BOTH the regular card form
      // AND Google Pay / Apple Pay wallets (Stripe surfaces them as express
      // checkout buttons IF the user's browser supports the wallet AND the
      // domain is registered in Stripe Dashboard for the wallet).
      //
      // "amazon_pay" was briefly removed while its express button rendered a
      // broken logo — the cause was Dashboard-side, not code (Amazon Pay not
      // fully activated + the payment-method domain unregistered), and our CSS
      // can't reach inside Stripe's cross-origin iframe to patch it. Both are
      // now done for elitevaultapp.com, so it's back on. If the broken logo
      // ever returns, check that activation and the domain registration are
      // still in place before touching this array. Mirrored in
      // app/actions/blocks-export.ts — keep the two in lockstep.
      payment_method_types: ["card", "amazon_pay", "cashapp", "link"],

      // Locale follows the user's browser language.
      locale: "auto",

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
        metadata: { supabase_user_id: userId, plan },
        description: `EliteVault ${planLabel} — ${interval === "year" ? "annual" : "monthly"} subscription`,
      },
      metadata: { supabase_user_id: userId, plan },
    });

    if (!session.client_secret) {
      return {
        ok: false,
        error: "no_client_secret",
        detail: "Stripe didn't return a checkout session.",
        status: 500,
      };
    }

    // Abandoned-checkout recovery (Part 2). Additive and best-effort: emit a
    // `checkout/started` event so the Inngest sequence can email the user if
    // they don't complete payment. Gated by CHECKOUT_RECOVERY_ENABLED (default
    // off). Wrapped so a failed emit NEVER breaks the checkout.
    if (process.env.CHECKOUT_RECOVERY_ENABLED === "true") {
      try {
        // One sequence per user, not per session. Every render of
        // /app/checkout creates a NEW Stripe session and checkout_recovery is
        // keyed by session_id, so without this guard each reload started its
        // own 3-email sequence (3 reloads → up to 9 emails). Skip the emit
        // while a pending sequence from the last 72h (the sequence's length)
        // already exists. The row is written by the Inngest `register` step,
        // so a reload within a second or two of the first can still slip
        // through; ordinary reloads are caught.
        const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await service
          .from("checkout_recovery")
          .select("session_id")
          .eq("user_id", userId)
          .eq("status", "pending")
          .gte("created_at", since)
          .limit(1);

        if (!existing || existing.length === 0) {
          await inngest.send({
            name: "checkout/started",
            data: {
              sessionId: session.id,
              userId,
              email: p?.email ?? userEmail ?? "",
              plan,
              interval,
            },
          });
        }
      } catch (err) {
        console.error("[stripe/checkout] recovery emit failed:", err);
      }
    }

    return { ok: true, clientSecret: session.client_secret };
  } catch (err) {
    // Catch-all so a Stripe SDK throw NEVER escapes. Before the route had
    // this, `stripe.checkout.sessions.create` errors (most commonly
    // "No such price" when Live keys are mixed with Test price IDs) bubbled
    // up unhandled and the client got "Unexpected end of JSON input".
    const msg = err instanceof Error ? err.message : "checkout_failed";
    const code = (err as { code?: string })?.code;
    const detail = (err as { raw?: { message?: string } })?.raw?.message;
    console.error("[stripe/checkout] failed:", { msg, code, detail });
    return {
      ok: false,
      error: code ?? "checkout_failed",
      detail: detail ?? msg,
      status: 500,
    };
  }
}
