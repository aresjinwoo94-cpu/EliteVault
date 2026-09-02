import { PLANS } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";

/**
 * Free-tier Library gate: which winners show FULL metrics.
 *
 * `libraryFullMetricsCap` is the NUMBER of winners a plan sees unlocked
 * (null = unlimited). Only the first `cap` PRESELECTED stores are unlocked;
 * every other card — extra preselected ones plus all non-preselected — is
 * locked. Counting in code, rather than trusting however many rows happen to
 * carry `is_preselected = true`, is what makes "3 winners on Free" literally
 * true without a data migration.
 *
 * Extracted from `app/actions/search.ts` so the shipped rule is the one under
 * test: this is a paid/free boundary, and the brief that prompted the audit
 * flagged it as read-but-never-exercised. It stays a pure function over rows —
 * the caller resolves `plan` from the session, never from client input, which
 * is what makes the gate unspoofable.
 */
export function applyMetricsCap<
  T extends { is_preselected?: boolean | null; metrics?: unknown },
>(items: T[], plan: PlanTier): (T & { metrics_locked: boolean })[] {
  const cap = PLANS[plan].libraryFullMetricsCap;
  let unlocked = 0;
  return items.map((it) => {
    if (cap === null) return { ...it, metrics_locked: false };
    const canUnlock = Boolean(it.is_preselected) && unlocked < cap;
    if (canUnlock) {
      unlocked++;
      return { ...it, metrics_locked: false };
    }
    // The lock has to REMOVE the data, not just flag it. Returning the real
    // metrics with `metrics_locked: true` and blurring them in CSS meant every
    // paywalled figure still shipped in the RSC payload, readable from
    // devtools — the gate was a visual treatment, not an authorization
    // boundary. `lib/library/niche-winners.ts` gateWinners() already did this
    // correctly (`winners: []` for Free); this brings the Library in line.
    return { ...it, metrics: null, metrics_locked: true };
  });
}
