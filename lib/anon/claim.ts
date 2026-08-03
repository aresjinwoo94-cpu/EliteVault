import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Re-parent an anonymous audit to a real account (activation-funnel continuity,
 * spec §2 "regla de continuidad crítica"): when a Tier-0 visitor signs up, the
 * audit they just ran must survive and appear in their account with the free
 * roadmap unlocked.
 *
 * Runs with the service client (RLS-bypassing) because the anonymous row has no
 * owner yet, so no logged-in identity can touch it through RLS. We only claim
 * rows that are STILL unowned (`user_id is null`) and match this browser's anon
 * token, so a stale/replayed token can never steal an already-claimed audit.
 *
 * Idempotent and best-effort: returns the newest claimed analysis id (to send
 * the user straight to it) or null. Never throws — a failed claim must not break
 * sign-in; the user simply lands on the analyzer with a fresh credit.
 */
export async function claimAnonAnalyses(
  userId: string,
  anonToken: string | null,
): Promise<string | null> {
  if (!anonToken) return null;
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("analyses")
      .update({ user_id: userId, anon_id: null, anon_ip_hash: null })
      .eq("anon_id", anonToken)
      .is("user_id", null)
      .select("id, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[anon claim] failed:", error.message);
      return null;
    }
    const rows = (data ?? []) as { id: string }[];
    return rows[0]?.id ?? null;
  } catch (err) {
    console.warn("[anon claim] error:", (err as Error).message);
    return null;
  }
}
