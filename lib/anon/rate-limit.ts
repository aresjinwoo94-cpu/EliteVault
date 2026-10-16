import "server-only";
import { headers } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hashIp } from "./session";

/**
 * Per-IP-per-day cap on anonymous audits. Each anonymous audit is a real AI
 * cost with no account behind it, so this is the anti-abuse backstop for the
 * open, no-login endpoint. Configurable via env; defaults to 1 (the spec's
 * "1 free audit per visitor per day").
 */
export function anonAuditLimitPerDay(): number {
  const raw = Number(process.env.ANON_AUDIT_LIMIT_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

/** Best-effort client IP from the standard proxy headers (Vercel sets these). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "0.0.0.0";
}

/** An audit that is still running counts for this long (blocks parallel abuse); after that a stuck row stops counting. */
export const ANON_IN_FLIGHT_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Does this anonymous audit use up the visitor's daily allowance? ONLY audits that finished (`succeeded`) do — a
 * failed / timed-out / refunded / capture-blocked audit never costs the visitor their free try — plus audits that
 * are running right now (so nobody can fire a dozen in parallel). Pure; mirrored by `anonLimitFilter`.
 */
export function countsTowardAnonLimit(
  row: { status: string; created_at: string; result?: { capture_blocked?: { detected?: boolean | null } | null } | null },
  now = Date.now(),
): boolean {
  const age = now - new Date(row.created_at).getTime();
  // A "succeeded" run whose screenshot was an anti-bot wall (capture_blocked) produced no real audit: not a used try.
  if (row.status === "succeeded") return age <= DAY_MS && row.result?.capture_blocked?.detected !== true;
  if (row.status === "queued" || row.status === "running") return age <= ANON_IN_FLIGHT_MS;
  return false;
}

/** PostgREST `or` filter equivalent to `countsTowardAnonLimit`. */
export function anonLimitFilter(now = Date.now()): string {
  const day = new Date(now - DAY_MS).toISOString();
  const flight = new Date(now - ANON_IN_FLIGHT_MS).toISOString();
  return (
    `and(status.eq.succeeded,created_at.gte.${day},or(result->capture_blocked->>detected.is.null,result->capture_blocked->>detected.eq.false)),` +
    `and(status.in.(queued,running),created_at.gte.${flight})`
  );
}

export type RateCheck = { allowed: boolean; used: number; limit: number; ipHash: string };

/**
 * Count how many anonymous audits of this IP use up the daily allowance (see
 * `countsTowardAnonLimit`: finished-successfully in the last 24h, or running right now) and
 * decide whether another is allowed. We count rows in `analyses` (no extra
 * table) written with this IP's salted hash — the index
 * analyses_anon_ip_created_idx keeps it a cheap range scan.
 *
 * Fail-open on a DB error: a metering blip must not block a legitimate first
 * audit (the welcome-credit gate on the logged-in side is the harder wall).
 */
export async function checkAnonAuditRate(): Promise<RateCheck> {
  const limit = anonAuditLimitPerDay();
  const ip = await getClientIp();
  const ipHash = hashIp(ip);

  try {
    const service = createSupabaseServiceClient();
    const { count, error } = await service
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("anon_ip_hash", ipHash)
      .or(anonLimitFilter());
    if (error) {
      console.warn("[anon rate-limit] count failed, allowing:", error.message);
      return { allowed: true, used: 0, limit, ipHash };
    }
    const used = count ?? 0;
    return { allowed: used < limit, used, limit, ipHash };
  } catch (err) {
    console.warn("[anon rate-limit] error, allowing:", (err as Error).message);
    return { allowed: true, used: 0, limit, ipHash };
  }
}
