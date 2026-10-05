"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog, phCapture } from "@/lib/analytics/posthog";

/**
 * PostHog client init + automatic $pageview tracking on App Router
 * navigation.
 *
 *   • posthog-js is loaded with a dynamic import once the browser is idle (and
 *     later on the checkout, so it never competes with Stripe's iframe) — see
 *     lib/analytics/posthog.ts. It is no longer part of any page's initial JS.
 *
 *   • Next.js App Router doesn't fire a page-load event on client navigations,
 *     so `$pageview` is re-captured on every pathname/searchParams change.
 *
 *   • `useSearchParams` is isolated in a Suspense boundary.
 *
 *   • Init is gated on NEXT_PUBLIC_POSTHOG_KEY; without it this is a
 *     passthrough. The localStorage opt-out (`__ev_no_analytics`) is honoured.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  const pathname = usePathname();
  const onCheckout = pathname?.startsWith("/app/checkout") ?? false;

  useEffect(() => {
    if (!key) return;
    try {
      if (window.localStorage.getItem("__ev_no_analytics") === "1") return;
    } catch {
      /* localStorage blocked — proceed */
    }
    let cancelled = false;
    const start = () => {
      if (!cancelled) void initPostHog(key, host);
    };
    // Idle after load; the checkout waits longer so Stripe.js and the payment
    // iframe get the main thread and the network first.
    const delay = onCheckout ? 8000 : 2500;
    let handle: number | undefined;
    const schedule = () => {
      handle = window.setTimeout(() => {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(start, { timeout: 4000 });
        } else {
          start();
        }
      }, delay);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (handle) window.clearTimeout(handle);
    };
  }, [key, host, onCheckout]);

  if (!key) return <>{children}</>;

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  );
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || typeof window === "undefined") return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    phCapture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
