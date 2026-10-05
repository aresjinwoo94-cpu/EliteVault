import { redirect } from "next/navigation";
import { createSupabaseServerClient , getUserResult } from "@/lib/supabase/server";
// PlanTier comes from the DB types; lib/stripe/plans imports it without
// re-exporting, so importing it from there types PLANS lookups as `any`.
import { PLANS, type Interval } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";
import { EmbeddedCheckoutForm } from "@/components/billing/embedded-checkout";
import { CheckoutLayout } from "@/components/billing/checkout-layout";
import { createEmbeddedCheckoutSession } from "@/lib/stripe/checkout-session";
import { getLocale } from "@/lib/i18n/server";

export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

/**
 * Custom Embedded Checkout page (v3.8.3).
 *
 * This page owns auth and the Stripe session; everything the buyer sees is
 * components/billing/checkout-layout.tsx, which takes the payment panel as a
 * slot. Desktop is the original two columns (plan summary | Stripe iframe);
 * on a phone the form comes first — see the layout component and brief §5.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const sp = await searchParams;
  const planId = sp.plan as PlanTier | undefined;
  const interval = (sp.interval as Interval | undefined) ?? "month";

  // Validate plan & interval
  if (!planId || planId === "free" || !PLANS[planId]) {
    redirect("/pricing");
  }
  if (interval !== "month" && interval !== "year") {
    redirect("/pricing");
  }

  // Auth check — checkout requires a logged-in user. The locale read runs
  // alongside it (both are cheap request-scoped reads).
  const supabase = await createSupabaseServerClient();
  const [
    {
      data: { user },
    },
    locale,
  ] = await Promise.all([getUserResult(), getLocale()]);
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/app/checkout?plan=${planId}&interval=${interval}`)}`,
    );
  }

  // Deliberately NOT awaited. Starting the Stripe session here gets the
  // customer probe + session create in flight at request time, overlapping the
  // document response instead of waiting for the client bundle to hydrate and
  // fetch. The promise is handed to a client component that unwraps it under
  // Suspense, so everything else on this page paints immediately.
  // createEmbeddedCheckoutSession never rejects — a rejected promise crossing
  // the server/client boundary would take the page down.
  const sessionPromise = createEmbeddedCheckoutSession({
    userId: user.id,
    userEmail: user.email ?? null,
    plan: planId,
    interval,
    // Stripe renders in the site's language, never the browser's ("auto").
    locale,
  });

  return (
    <>
      {/*
        Warm up the TCP/TLS connections to Stripe BEFORE the embedded iframe
        starts loading. The form does an API round-trip then mounts an iframe
        from js.stripe.com → this shaves the DNS+TLS handshake off the
        critical path so the payment form paints sooner. (React 19 hoists
        these to <head>.)
      */}
      {/* Start downloading Stripe.js NOW, in parallel with our own JS. The embedded
          form needs it, but loadStripe() only injects the script after our
          checkout chunk has downloaded, parsed and run — on a phone that is
          seconds later. Same URL @stripe/stripe-js injects (its RELEASE_TRAIN;
          a test pins them together), no crossorigin attribute to match it. */}
      <link rel="preload" as="script" href="https://js.stripe.com/dahlia/stripe.js" />
      <link rel="preconnect" href="https://js.stripe.com" crossOrigin="" />
      <link rel="preconnect" href="https://api.stripe.com" crossOrigin="" />
      <link rel="preconnect" href="https://checkout.stripe.com" crossOrigin="" />
      <link rel="preconnect" href="https://m.stripe.network" crossOrigin="" />
      <link rel="preconnect" href="https://hooks.stripe.com" crossOrigin="" />
      <link rel="dns-prefetch" href="https://js.stripe.com" />
      <link rel="dns-prefetch" href="https://api.stripe.com" />
      <link rel="dns-prefetch" href="https://m.stripe.network" />
      <link rel="dns-prefetch" href="https://hooks.stripe.com" />

      <CheckoutLayout
        planId={planId}
        interval={interval}
        payment={
          <EmbeddedCheckoutForm
            plan={planId}
            interval={interval}
            sessionPromise={sessionPromise}
          />
        }
      />
    </>
  );
}
