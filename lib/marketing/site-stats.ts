import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getWinningStoresCountRaw } from "@/lib/library/winning-sites-count";
import { NICHE_COUNT } from "@/lib/meta/niche-benchmarks";
import { aiVisitsToShow, visibleCounters, type Counter } from "@/lib/marketing/in-use";

/**
 * Live numbers for the landing's "In use" block. Everything here is cached
 * (6 h), raced against a short timeout, and resolves to null on ANY failure:
 * it must never throw and never hold the landing up. No third-party calls.
 */
const REVALIDATE_SECONDS = 6 * 60 * 60;
const TIMEOUT_MS = 1500;

async function withTimeout<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await Promise.race<T | null>([
      p,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

/** Emails that count as "internal" (owner/test accounts). Same env as lib/analytics/is-internal.ts. */
function internalEmails(): string[] {
  return (process.env.INTERNAL_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Stores that belong to the owner/company: audits of THESE are product tests,
 * not usage, so they are excluded from the public counter (anonymous runs on
 * them can't be tied to an internal account, hence the domain rule).
 */
const INTERNAL_AUDIT_DOMAINS = ["elitevaultapp.com", "vitallivingstore.com", "vita-lliving.myshopify.com"];

/**
 * Completed audits (status 'succeeded'), EXCLUDING:
 *   • audits run by internal accounts (INTERNAL_EMAILS plus *.local test addresses), and
 *   • audits OF our own stores (INTERNAL_AUDIT_DOMAINS), signed-in or anonymous.
 * If INTERNAL_EMAILS is not configured we cannot tell internal from real, so we
 * throw (→ null → counter hidden) instead of overstating. Refunded audits are
 * never counted.
 */
const fetchAuditsCompleted = unstable_cache(
  async (): Promise<number> => {
    const emails = internalEmails();
    if (emails.length === 0) throw new Error("INTERNAL_EMAILS not configured");
    const svc = createSupabaseServiceClient();

    const { count: total, error: e1 } = await svc
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("status", "succeeded");
    if (e1 || typeof total !== "number") throw new Error("analyses count failed");

    // Internal accounts: filtered in SQL (no row cap), not by reading every profile.
    const emailFilter = [...emails.map((e) => `email.eq.${e}`), "email.ilike.*.local"].join(",");
    const { data: profiles, error: e2 } = await svc.from("profiles").select("id").or(emailFilter);
    if (e2 || !Array.isArray(profiles)) throw new Error("profiles read failed");
    const internalIds = (profiles as { id: string }[]).map((r) => r.id);

    const clauses = INTERNAL_AUDIT_DOMAINS.map((d) => `url.ilike.*${d}*`);
    if (internalIds.length > 0) clauses.push(`user_id.in.(${internalIds.join(",")})`);
    const { count: internal, error: e3 } = await svc
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("status", "succeeded")
      .or(clauses.join(","));
    if (e3 || typeof internal !== "number") throw new Error("internal count failed");
    return Math.max(0, total - internal);
  },
  ["landing-audits-completed-v2"],
  { revalidate: REVALIDATE_SECONDS },
);

/** Visits (sessions) from AI assistants in the last 30 days; first-party, bots/internal already excluded. */
const fetchAiVisits30d = unstable_cache(
  async (): Promise<number> => {
    const svc = createSupabaseServiceClient();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { count, error } = await svc
      .from("sessions")
      .select("session_id", { count: "exact", head: true })
      .eq("is_internal", false)
      .in("channel", ["ChatGPT", "Gemini", "Perplexity", "Claude", "Copilot"])
      .gte("started_at", since);
    if (error || typeof count !== "number") throw new Error("ai visits count failed");
    return count;
  },
  ["landing-ai-visits-30d"],
  { revalidate: REVALIDATE_SECONDS },
);

export type InUseData = { counters: Counter[]; aiVisits: number | null };

export async function getInUseData(): Promise<InUseData> {
  const [audits, stores, ai] = await Promise.all([
    withTimeout(fetchAuditsCompleted()),
    withTimeout(getWinningStoresCountRaw()),
    withTimeout(fetchAiVisits30d()),
  ]);
  return {
    counters: visibleCounters({ audits, stores, niches: NICHE_COUNT }),
    aiVisits: aiVisitsToShow(ai),
  };
}
