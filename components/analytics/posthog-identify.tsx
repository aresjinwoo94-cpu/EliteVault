"use client";

import { useEffect } from "react";
import { phGroup, phIdentify } from "@/lib/analytics/posthog";

/**
 * Connect the current PostHog anonymous session to the signed-in user
 * + tag them with plan/email so the dashboard can segment by tier.
 *
 * Mounted inside the authenticated (app) layout — it runs once per
 * mount with the server-resolved profile. PostHog handles the "stitch
 * anon → identified" transition: any events captured before identify()
 * get back-attached to the resolved user ID.
 *
 * Safe to render when PostHog isn't initialized (key missing) — the
 * `__loaded` guard short-circuits and we no-op.
 */
export function PostHogIdentify({
  userId,
  email,
  plan,
  fullName,
}: {
  userId: string;
  email: string | null | undefined;
  plan: string | null | undefined;
  fullName: string | null | undefined;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // PostHog loads lazily (lib/analytics/posthog.ts); the facade queues these
    // calls until it is ready and drops them if it never loads.
    phIdentify(userId, {
      email: email ?? undefined,
      name: fullName ?? undefined,
      plan: plan ?? "free",
    });

    // Group analytics by plan tier (free / pro / scale) — lets you
    // build cohort reports like "% of pro users who used the meta
    // simulator this week" in PostHog.
    if (plan) {
      phGroup("plan", plan);
    }
  }, [userId, email, plan, fullName]);

  return null;
}
