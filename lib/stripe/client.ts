// `/pure`: the default entry of @stripe/stripe-js INJECTS the js.stripe.com script
// the moment the module is imported. Pages that only show an upgrade button
// (pricing, billing, the landing page) import this file for `preloadStripe`, and
// must not download Stripe until someone shows intent.
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

/**
 * One shared Stripe.js load for the browser.
 *
 * `loadStripe` injects the js.stripe.com script, so calling it early IS the
 * preload: the upgrade CTAs call `preloadStripe()` on hover / focus / touch,
 * and by the time the checkout page mounts the Embedded Checkout, Stripe.js is
 * already downloaded and evaluated. It never creates a Checkout Session —
 * that costs a Stripe API call and only happens on entering /app/checkout.
 */
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let promise: Promise<Stripe | null> | null = null;

/** null when there is no publishable key (loadStripe("") rejects deep inside Stripe.js). */
export function getStripePromise(): Promise<Stripe | null> | null {
  if (!PUBLISHABLE_KEY) return null;
  return (promise ??= loadStripe(PUBLISHABLE_KEY));
}

export function preloadStripe(): void {
  if (typeof window === "undefined") return;
  void getStripePromise()?.catch(() => {
    /* blocked by an extension — the checkout page explains it */
  });
}
