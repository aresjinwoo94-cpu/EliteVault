import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Idempotency for audit requests.
 *
 * # The problem
 * An audit is a long, expensive job: a screenshot capture, a vision call, and
 * a credit. Nothing stopped a user from starting the SAME one repeatedly — a
 * double-click on the launcher, an impatient re-submit while the first is
 * still running, a browser back-then-forward. Each one deducted a credit,
 * queued another job, and consumed the same free-tier quotas (Gemini RPM,
 * ScreenshotOne captures) that every other user is sharing. The user then
 * waits behind their own duplicates.
 *
 * # The rule
 * Same user + same URL, recently → hand back the audit they already have.
 *
 *   • queued/running  → ALWAYS reuse. There is no argument for running the
 *                       identical job twice in parallel; the second can only
 *                       produce the same report later and at double the cost.
 *   • succeeded       → reuse inside a short window (default 60 min). This is
 *                       scoped to accidental repeats, NOT to "cache audits for
 *                       a day": someone who fixes their hero and re-audits an
 *                       hour later must get a FRESH read, or the product lies
 *                       to them. The genuinely expensive half of a re-audit is
 *                       already avoided by the screenshot URL cache, which is
 *                       safe to keep for much longer.
 *   • failed/refunded → never reused, so "Try again" always means try again.
 *
 * Reuse is per-user on purpose. Audits are personal (buyer persona, plan tier,
 * publication state) and RLS-scoped; sharing one user's report with another
 * would leak their data to save a few seconds.
 */

/** How long a SUCCEEDED audit answers a repeat request for the same URL. */
const REUSE_TTL_MS = (() => {
  const raw = Number(process.env.ANALYSIS_REUSE_TTL_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 0 ? raw : 60;
  return minutes * 60_000;
})();

/**
 * How long we'll consider an in-flight job "still alive". Past this it's
 * assumed stuck (its Inngest run died without writing a terminal status), and
 * a new request should start a real job rather than adopt a zombie.
 */
const IN_FLIGHT_TTL_MS = 15 * 60_000;

export interface ReusableAnalysis {
  id: string;
  status: string;
  /** True when the work is already finished — the caller can go straight there. */
  done: boolean;
}

/**
 * Find an audit that already answers this request, or null.
 *
 * Never throws: a failure here must not block a legitimate audit, so any error
 * degrades to "no reusable analysis" and the normal path runs.
 */
export async function findReusableAnalysis(
  // The Supabase client types collapse to `never` on this project's
  // hand-written Database type (see next.config.mjs) — widen deliberately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  userId: string,
  url: string | null,
  opts: { force?: boolean } = {},
): Promise<ReusableAnalysis | null> {
  // An uploaded screenshot has no URL to match on, and "force" means the user
  // explicitly asked for a fresh run.
  if (!url || opts.force) return null;

  try {
    const since = new Date(
      Date.now() - Math.max(IN_FLIGHT_TTL_MS, REUSE_TTL_MS),
    ).toISOString();

    const { data, error } = await client
      .from("analyses")
      .select("id, status, created_at, finished_at")
      .eq("user_id", userId)
      .eq("url", url)
      .in("status", ["queued", "running", "succeeded"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error || !Array.isArray(data)) return null;

    const now = Date.now();
    for (const row of data as {
      id: string;
      status: string;
      created_at: string;
      finished_at: string | null;
    }[]) {
      const age = (iso: string | null) =>
        iso ? now - new Date(iso).getTime() : Number.POSITIVE_INFINITY;

      if (row.status === "queued" || row.status === "running") {
        if (age(row.created_at) <= IN_FLIGHT_TTL_MS) {
          return { id: row.id, status: row.status, done: false };
        }
        continue; // stale/stuck job — don't adopt it
      }
      if (
        row.status === "succeeded" &&
        REUSE_TTL_MS > 0 &&
        age(row.finished_at ?? row.created_at) <= REUSE_TTL_MS
      ) {
        return { id: row.id, status: row.status, done: true };
      }
    }
    return null;
  } catch (err) {
    console.warn("[analysis-reuse] lookup failed:", (err as Error).message);
    return null;
  }
}
