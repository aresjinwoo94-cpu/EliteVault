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
 *   - 'monitoredCompetitor' → row count in monitored_stores (Phase 3).
 *   - 'trackedNiche'        → row count in tracked_niches  (Phase 2/3).
 *
 * Phase-2/3 kinds are defined now so callers can depend on a stable API, but
 * their backing tables land in later phases; until then they expose the plan
 * limit without enforcing (no query against tables that don't exist yet).
 */
export type QuotaKind = "analysis" | "monitoredCompetitor" | "trackedNiche";

export type QuotaResult =
  | { ok: true; remaining: number | null }
  | { ok: false; reason: string; limit: number };

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

    // Enforcement wired in later phases (tables don't exist yet). We return
    // the plan limit so callers and the UI can already reason about it.
    case "monitoredCompetitor":
      return { ok: true, remaining: quotas.monitoredCompetitors };
    case "trackedNiche":
      return { ok: true, remaining: quotas.trackedNiches };
  }
}
