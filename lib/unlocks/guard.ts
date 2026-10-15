import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAnalysisUnlocked } from "@/lib/unlocks/entitlement";

/**
 * Server-side guards for offering the one-time unlock (brief oct-2026 §5.1) — all of them, in one place,
 * shared by the checkout page. The decision is made from the session and the database, never from the URL.
 */
export type UnlockEligibility =
  | { kind: "ok"; url: string | null; domain: string }
  | { kind: "not_found" } // not the owner's audit (404: don't reveal others' audits)
  | { kind: "not_ready" } // not succeeded, or the capture was blocked: nothing worth selling
  | { kind: "has_full_report" }; // paid plan, or already unlocked

export async function checkUnlockEligibility(analysisId: string, userId: string): Promise<UnlockEligibility> {
  const supabase = await createSupabaseServerClient();
  const [{ data: row }, { data: prof }] = await Promise.all([
    supabase.from("analyses").select("id, status, url, result").eq("id", analysisId).eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
  ]);
  const a = row as unknown as {
    status: string;
    url: string | null;
    result: { capture_blocked?: { detected?: boolean } } | null;
  } | null;
  if (!a) return { kind: "not_found" };
  if (a.status !== "succeeded" || !a.result || a.result.capture_blocked?.detected) return { kind: "not_ready" };
  const plan = (prof as unknown as { plan?: string } | null)?.plan ?? "free";
  if (plan !== "free") return { kind: "has_full_report" };
  if (await isAnalysisUnlocked(analysisId, userId)) return { kind: "has_full_report" };
  let domain = "your store";
  try {
    if (a.url) domain = new URL(a.url).hostname.replace(/^www\./, "");
  } catch {
    /* uploaded screenshot or unparsable url */
  }
  return { kind: "ok", url: a.url, domain };
}
