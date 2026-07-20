import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";

/**
 * Unified, server-side quota guard — the SINGLE place that answers "is this
 * user allowed to do X right now?". The client is never trusted.
 *
 * Backing stores per kind:
 *   - 'analysis'            → profiles.credits (UNCHANGED from the existing
 *                             credit system, so the Analyzer behaves exactly
 *                             as before; credits stay the source of truth).
 *   - 'metaRun'             → row count in meta_simulations within the current
 *                             calendar month (Meta block runs; Pro = 1/mo).
 *   - 'trackedNiche'        → row count in tracked_niches  (Phase 2/3).
 *
 * IMPORTANT: only select columns that exist in the LIVE database. The
 * `profiles` table in production does NOT have `current_period_start` (it's
 * in migration 0001 but was never applied), so selecting it makes the whole
 * query error and the profile read null — which previously surfaced as a
 * spurious "Profile not found" on the Analyzer. The Meta-run window therefore
 * anchors to the 1st of the current UTC month, which is also the doc's primary
 * reset spec.
 */
export type QuotaKind = "analysis" | "metaRun" | "trackedNiche";

/** Stable error code the API/action returns when the Meta quota is spent. */
export const META_QUOTA_EXCEEDED = "META_QUOTA_EXCEEDED";

export type QuotaResult =
  | { ok: true; remaining: number | null }
  | { ok: false; reason: string; limit: number; code?: string };

export async function assertQuota(
  userId: string,
  kind: QuotaKind,
): Promise<QuotaResult> {
  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("plan, credits")
    .eq("id", userId)
    .single();
  if (!profile) return { ok: false, reason: "Profile not found", limit: 0 };

  const plan = (profile as { plan: PlanTier }).plan;
  const credits = (profile as { credits: number }).credits;
  const quotas = PLANS[plan].quotas;

  switch (kind) {
    case "analysis": {
      if (credits <= 0) {
        return {
          ok: false,
          reason:
            plan === "free"
              ? "You've used your free audit. Upgrade to Pro to keep auditing — your first paid insight usually pays for the month."
              : "You're out of credits for this billing period.",
          limit: quotas.analysesPerMonth,
        };
      }
      return { ok: true, remaining: credits };
    }

    case "metaRun": {
      const limit = quotas.metaRunsPerMonth;
      // null = unlimited (Scale). 0 = never (Free).
      if (limit === null) return { ok: true, remaining: null };
      if (limit <= 0) {
        return {
          ok: false,
          reason:
            "The Meta campaign block is a paid feature. Upgrade to Pro to run it.",
          limit: 0,
          code: META_QUOTA_EXCEEDED,
        };
      }
      // Count runs since the 1st of the current UTC month. Only committed runs
      // count — a failed run must not burn the quota.
      const { count } = await service
        .from("meta_simulations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["queued", "running", "succeeded"])
        .gte("created_at", currentMonthStart());
      const used = count ?? 0;
      if (used >= limit) {
        return {
          ok: false,
          reason:
            "You've used your Meta campaign projection for this month. Scale includes unlimited projections.",
          limit,
          code: META_QUOTA_EXCEEDED,
        };
      }
      return { ok: true, remaining: limit - used };
    }

    // Enforcement wired in a later phase (table not created yet).
    case "trackedNiche":
      return { ok: true, remaining: quotas.trackedNiches };
  }
}

/**
 * Meta-run usage for the current calendar month — for UI counters ("1 of 1
 * this month"). Enforcement still lives in assertQuota; this is read-only.
 */
export async function getMetaRunUsage(
  userId: string,
): Promise<{ limit: number | null; used: number }> {
  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();
  if (!profile) return { limit: 0, used: 0 };
  const plan = (profile as { plan: PlanTier }).plan;
  const limit = PLANS[plan].quotas.metaRunsPerMonth;
  if (limit === null) return { limit: null, used: 0 };
  const { count } = await service
    .from("meta_simulations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "running", "succeeded"])
    .gte("created_at", currentMonthStart());
  return { limit, used: count ?? 0 };
}

/** ISO string for 00:00 UTC on the 1st of the current month. */
function currentMonthStart(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}
