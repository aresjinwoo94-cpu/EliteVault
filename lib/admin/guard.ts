import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Owner / admin gate for the private business dashboard (/app/owner).
 *
 * Reuses the same idea as lib/analytics/is-internal.ts: the authoritative
 * signal is the logged-in user's email matching an allow-list in env.
 *
 *   ADMIN_EMAILS=you@gmail.com           (preferred, dedicated)
 *   INTERNAL_EMAILS=you@gmail.com,...    (fallback — already used for analytics)
 *
 * If NEITHER is set, nobody is admin (fail closed) so the dashboard never
 * leaks business metrics by accident.
 */
function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || process.env.INTERNAL_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Returns the authenticated owner User, or null if the caller isn't an admin. */
export async function getOwner(): Promise<User | null> {
  const list = adminEmails();
  if (list.length === 0) return null; // fail closed

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase();
    if (!user || !email) return null;
    return list.includes(email) ? user : null;
  } catch {
    return null;
  }
}

export async function isOwner(): Promise<boolean> {
  return (await getOwner()) !== null;
}
