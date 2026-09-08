import type { PlanTier } from "@/lib/supabase/types";

/** Paid plans only — the checkout page redirects `free` straight back to
 *  /pricing, so it must never be built into a post-auth destination. */
type PaidPlan = Exclude<PlanTier, "free">;

function isPaidPlan(v: string | undefined): v is PaidPlan {
  return v === "pro" || v === "scale";
}

/**
 * Post-auth destination for a visitor who arrived from a pricing CTA
 * (`/sign-up?plan=pro&interval=month`, and the same on `/sign-in`).
 *
 * Returns the checkout URL for a VALID paid plan, or null when there's no
 * plan to honour — callers fall back to `next` and then their own default.
 * Both values are validated against a closed set rather than interpolated, so
 * this can't be used to smuggle an arbitrary redirect target through `plan`.
 */
export function checkoutNextUrl(sp: {
  plan?: string;
  interval?: string;
}): string | null {
  if (!isPaidPlan(sp.plan)) return null;
  const interval = sp.interval === "year" ? "year" : "month";
  return `/app/checkout?plan=${sp.plan}&interval=${interval}`;
}
