"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(posthog as any).__loaded) return;

    const current = posthog.get_distinct_id?.();
    if (current === userId) return; // already identified

    posthog.identify(userId, {
      email: email ?? undefined,
      name: fullName ?? undefined,
      plan: plan ?? "free",
    });

    // Group analytics by plan tier (free / pro / scale) — lets you
    // build cohort reports like "% of pro users who used the meta
    // simulator this week" in PostHog.
    if (plan) {
      posthog.group("plan", plan);
    }
  }, [userId, email, plan, fullName]);

  return null;
}
