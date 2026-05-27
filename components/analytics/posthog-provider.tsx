"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

/**
 * PostHog client init + automatic $pageview tracking on App Router
 * navigation.
 *
 * Why this file looks the way it does:
 *
 *   • Next.js App Router doesn't fire a full page-load event on client
 *     navigations, so PostHog's `capture_pageview: true` only catches
 *     the FIRST load. We manually re-capture `$pageview` on every
 *     pathname/searchParams change.
 *
 *   • `useSearchParams` opts a component into dynamic rendering, which
 *     would force every page on the site into the dynamic bucket.
 *     We isolate it inside a Suspense boundary so the rest of the
 *     tree stays static.
 *
 *   • Init is gated on `NEXT_PUBLIC_POSTHOG_KEY` being set, so the
 *     build doesn't break in environments without analytics (local dev
 *     by default, preview deploys, etc.). If the key is missing, the
 *     provider is a transparent passthrough.
 *
 *   • `capture_pageleave: true` enables the time-on-page metric — needed
 *     for the "bounce rate" / "avg session duration" cards in the
 *     PostHog dashboard, equivalent to Shopify's session-duration stats.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  useEffect(() => {
    if (!key) return;
    if (typeof window === "undefined") return;
    // Belt-and-suspenders: the AnalyticsGate already skips mounting
    // PostHog for internal users, but if someone wires this provider
    // directly (or the gate flag was set on a previous visit without a
    // re-render) we honor the localStorage flag here too.
    try {
      if (window.localStorage.getItem("__ev_no_analytics") === "1") return;
    } catch {
      /* localStorage blocked — proceed with default behavior */
    }
    // Re-init guard — posthog-js handles repeat init() calls but warns.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((posthog as any).__loaded) return;
    posthog.init(key, {
      api_host: host,
      // We handle SPA pageviews manually below.
      capture_pageview: false,
      capture_pageleave: true,
      // Session replay — start sampling immediately. PostHog free tier
      // gives 5,000 recordings/mo which is plenty for an early launch.
      // Each replay = one user session, regardless of how many pages.
      session_recording: {
        maskAllInputs: true, // never record what users type into forms
        maskTextSelector: "[data-private]", // mark sensitive UI elements
      },
      // Don't send events from local dev — keeps the dashboard clean.
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") ph.debug(false);
      },
      // Respect Do-Not-Track + cookie consent. PostHog handles GDPR
      // automatically when persistence is memory-only for opted-out users.
      respect_dnt: true,
    });
  }, [key, host]);

  if (!key) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(posthog as any).__loaded) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
