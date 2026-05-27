"use client";

import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PostHogProvider } from "./posthog-provider";

/**
 * Top-level analytics gate.
 *
 * Receives `isInternal` from the server-rendered root layout (true when
 * the logged-in email matches INTERNAL_EMAILS). When internal:
 *
 *   1. Persists a localStorage flag `__ev_no_analytics=1` so subsequent
 *      visits on this device — even when logged out, even in private
 *      mode if the user happens to log in once — stay silent.
 *   2. Returns NO analytics children at all. Vercel Analytics,
 *      Speed Insights, and PostHog all skip the entire mount path, so
 *      no script is even loaded.
 *
 * For NON-internal visitors, all three analytics children mount as
 * normal, but Vercel Analytics is wrapped with a `beforeSend` that
 * checks the same localStorage flag — so a previously-internal device
 * stays silent even after the email check no longer matches (e.g. dev
 * logged out and is now browsing as a regular user).
 *
 * Manual escape hatch: visiting /internal-opt-out sets the flag from
 * any device, even without ever logging in. Useful when QA-testing
 * the public marketing site from a fresh browser.
 */
export function AnalyticsGate({
  isInternal,
  children,
}: {
  isInternal: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isInternal) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("__ev_no_analytics", "1");
    } catch {
      /* localStorage disabled — nothing we can do, but also nothing
         will be tracked because we early-return below */
    }
  }, [isInternal]);

  // Hard kill — no analytics scripts mount at all for internal users.
  if (isInternal) {
    return <>{children}</>;
  }

  return (
    <>
      <Analytics
        beforeSend={(event) => {
          if (
            typeof window !== "undefined" &&
            window.localStorage.getItem("__ev_no_analytics") === "1"
          ) {
            return null; // drop the event silently
          }
          return event;
        }}
      />
      <SpeedInsights />
      <PostHogProvider>{children}</PostHogProvider>
    </>
  );
}
