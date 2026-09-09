"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import posthog from "posthog-js";
import type { CheckoutSessionResult } from "@/lib/stripe/checkout-session";

/**
 * Embedded Stripe Checkout.
 *
 * The form renders INSIDE our app in a dark obsidian container. Stripe still
 * owns the actual payment fields (PCI), but the page chrome — header, side
 * panel with plan summary, return link, fonts, gradients — is ours.
 *
 * Flow:
 *   1. The /app/checkout SERVER render starts the session (it already has the
 *      authenticated user) and passes the in-flight promise down. Previously
 *      this component fetched /api/stripe/checkout from a mount effect, so
 *      none of that work began until the JS bundle had downloaded, parsed and
 *      hydrated — and it re-did the auth check the page had just done. Now the
 *      Stripe round-trips overlap the document request, and the surrounding
 *      checkout paints while they're still in flight.
 *   2. `use()` unwraps the promise under a Suspense boundary; the fallback is
 *      the same loader as before.
 *   3. On completion Stripe redirects (via the server-configured return_url)
 *      to /app/checkout/return, which does eager sync + sends them onward.
 */

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
// Only build a Stripe instance when we actually have a key — loadStripe("")
// rejects deep inside Stripe.js and surfaces as a blank/broken iframe with no
// explanation. We guard on the key below and show a real message instead.
// Module scope, so Stripe.js starts downloading as soon as this chunk loads
// rather than waiting on the session.
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

// Test vs live mode of a key / client_secret, or null if unrecognized.
function pkMode(k: string): "live" | "test" | null {
  if (k.startsWith("pk_live_")) return "live";
  if (k.startsWith("pk_test_")) return "test";
  return null;
}
function csMode(cs: string): "live" | "test" | null {
  if (cs.startsWith("cs_live_")) return "live";
  if (cs.startsWith("cs_test_")) return "test";
  return null;
}

export function EmbeddedCheckoutForm({
  plan,
  interval,
  sessionPromise,
}: {
  plan: "pro" | "scale";
  interval: "month" | "year";
  sessionPromise: Promise<CheckoutSessionResult>;
}) {
  // PostHog: fire the funnel-start event the moment the user lands on the
  // checkout page — the "checkout started" step between "signup" and
  // "plan_upgraded". Outside the Suspense boundary so it isn't waiting on
  // Stripe.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== "undefined" && (posthog as any).__loaded) {
      posthog.capture("checkout_started", { plan, interval });
    }
  }, [plan, interval]);

  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutFrame sessionPromise={sessionPromise} />
    </Suspense>
  );
}

function CheckoutLoading() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-12 flex flex-col items-center justify-center min-h-[400px]">
      <Loader2 className="size-6 text-champagne-400 animate-spin" />
      <p className="mt-4 text-sm text-white/55">
        Preparing your secure checkout…
      </p>
    </div>
  );
}

function CheckoutFrame({
  sessionPromise,
}: {
  sessionPromise: Promise<CheckoutSessionResult>;
}) {
  const session = use(sessionPromise);
  const [stripeBlocked, setStripeBlocked] = useState(false);
  const router = useRouter();

  // Detect when Stripe.js itself can't load — loadStripe rejects (or resolves
  // null) if js.stripe.com is unreachable, which is almost always a client-side
  // ad blocker / privacy extension / VPN / firewall (net::ERR_CONNECTION_RESET),
  // not our config. Without this the payment panel just sits blank forever.
  useEffect(() => {
    if (!stripePromise) return;
    let cancelled = false;
    stripePromise
      .then((s) => {
        if (!cancelled && !s) setStripeBlocked(true);
      })
      .catch(() => {
        if (!cancelled) setStripeBlocked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clientSecret = session.ok ? session.clientSecret : null;

  // Config guards — turn a silent blank/broken iframe into a precise message.
  // (1) No publishable key baked into the build. NEXT_PUBLIC_* is inlined at
  //     BUILD time, so this also means "set it in Vercel AND redeploy".
  let configError: string | null = null;
  if (stripeBlocked) {
    configError =
      "Couldn't load Stripe's payment library (js.stripe.com). This is almost always an ad blocker, privacy extension (uBlock, Brave Shields, Ghostery), VPN, or firewall/antivirus on your device blocking Stripe. Disable it for this site, or try an incognito window or a different browser/network.";
  } else if (!PUBLISHABLE_KEY) {
    configError =
      "Stripe publishable key is missing. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in the environment and redeploy (it's baked in at build time).";
  } else if (clientSecret) {
    // (2) Mode mismatch — e.g. a pk_test_ key trying to mount a cs_live_
    //     session. Stripe.js silently refuses to render in this case.
    const km = pkMode(PUBLISHABLE_KEY);
    const sm = csMode(clientSecret);
    if (km && sm && km !== sm) {
      configError = `Stripe mode mismatch: your publishable key is ${km} mode but the checkout session is ${sm} mode. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to your pk_${sm}_… key (matching STRIPE_SECRET_KEY) and redeploy.`;
    }
  }

  const shownError = (session.ok ? null : session.detail) ?? configError;
  if (shownError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-6 text-center">
        <p className="text-sm text-destructive">{shownError}</p>
        <button
          onClick={() => router.push("/app/billing")}
          className="mt-4 text-xs text-white/55 hover:text-white"
        >
          ← Back to billing
        </button>
      </div>
    );
  }

  if (!clientSecret) return <CheckoutLoading />;

  return (
    <div className="rounded-2xl bg-obsidian-950 ring-1 ring-white/[0.08] overflow-hidden">
      {/*
        Stripe's Embedded Checkout honors our dark brand (set via Dashboard →
        Branding), so a white frame around the iframe would read as a jarring
        border. We match the wrapper to the page's obsidian background so the
        iframe blends in seamlessly. Any light strip behind the wallet buttons
        (Link / Amazon Pay) lives INSIDE Stripe's cross-origin iframe and is
        controlled by Stripe Dashboard branding, not by our CSS.
      */}
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
