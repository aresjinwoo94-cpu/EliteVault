import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Decide whether the current request should be EXCLUDED from analytics.
 *
 * Server-side check, runs in the root layout for every page. Two
 * signals are combined:
 *
 *   1. The logged-in user's email matches one of INTERNAL_EMAILS
 *      (comma-separated list in env, server-only — never shipped to
 *      the client). This is the authoritative check.
 *
 *   2. (Client-side, separate) localStorage flag set on any device
 *      where signal #1 ever fired. Persists across logout / new
 *      sessions / private mode is opt-in via /internal-opt-out.
 *
 * Why server-side + localStorage + manual escape hatch instead of just
 * IP-based filtering: IP filtering is fragile (dynamic IPs, VPN, mobile
 * networks), and Vercel Analytics' dashboard-level "exclude my visits"
 * only covers Vercel, not PostHog. With this approach the same flag
 * silences both stacks, on every device the dev touches.
 *
 * If INTERNAL_EMAILS isn't set the function safely returns false (no
 * exclusion). Set it in Vercel for both Production AND Preview.
 *
 * Example value:
 *   INTERNAL_EMAILS=you@gmail.com,test-pro@elitevault.local
 */
export async function isInternalRequest(): Promise<boolean> {
  const raw = process.env.INTERNAL_EMAILS;
  if (!raw) return false;

  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase();
    if (!email) return false;
    return list.includes(email);
  } catch {
    // Auth/session errors should never break analytics gating — fail
    // open (count the visit) rather than closed (silently drop it).
    return false;
  }
}
