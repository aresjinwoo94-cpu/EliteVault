"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import posthog from "posthog-js";

/**
 * Embedded Stripe Checkout (v3.8.3).
 *
 * Replaces the previous redirect-to-stripe.com flow. The form renders
 * INSIDE our app inside a dark obsidian container. Stripe still owns
 * the actual payment fields (PCI), but the page chrome — header, side
 * panel with plan summary, return link, fonts, gradients — is ours.
 *
 * Flow:
 *   1. On mount, POST /api/stripe/checkout with the selected plan +
 *      interval. The endpoint creates an embedded-mode session and
 *      returns a client_secret.
 *   2. We pass that secret to EmbeddedCheckoutProvider. Stripe.js
 *      mounts an iframe in the provider's child element.
 *   3. When the user completes payment, Stripe redirects (via the
 *      return_url configured server-side) to /app/checkout/return,
 *      which does eager sync + sends them onward.
 */

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

export function EmbeddedCheckoutForm({
  plan,
  interval,
}: {
  plan: "pro" | "scale";
  interval: "month" | "year";
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    // PostHog: fire the funnel-start event the moment the user lands
    // on the checkout page — this becomes the "checkout started" step
    // between "signup" and "plan_upgraded" in the conversion funnel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== "undefined" && (posthog as any).__loaded) {
      posthog.capture("checkout_started", { plan, interval });
    }
    (async () => {
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, interval }),
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string; detail?: string };
          throw new Error(j.detail ?? j.error ?? "Checkout init failed");
        }
        const data = (await res.json()) as { client_secret: string };
        if (!cancelled) setClientSecret(data.client_secret);
      } catch (err) {
        if (!cancelled) {
          const msg = (err as Error).message;
          setError(msg);
          toast.error(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, interval]);

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={() => router.push("/app/billing")}
          className="mt-4 text-xs text-white/55 hover:text-white"
        >
          ← Back to billing
        </button>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-12 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="size-6 text-champagne-400 animate-spin" />
        <p className="mt-4 text-sm text-white/55">
          Preparing your secure checkout…
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-1 ring-1 ring-white/[0.08] overflow-hidden">
      {/*
        The Embedded Checkout iframe enforces a LIGHT background regardless
        of our app theme — that's a Stripe design constraint, not ours.
        We give it a tight white frame so the visual transition into the
        iframe feels intentional rather than jarring.
      */}
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ clientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
