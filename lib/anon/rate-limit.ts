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

export type RateCheck = { allowed: boolean; used: number; limit: number; ipHash: string };

/**
 * Count how many anonymous audits this IP has started in the last 24h and
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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const service = createSupabaseServiceClient();
    const { count, error } = await service
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("anon_ip_hash", ipHash)
      .gte("created_at", since);
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
