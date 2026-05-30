"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

/**
 * P0.3 — Public shareable audits (organic growth engine).
 *
 * Any plan can turn a completed audit into a public, read-only link
 * ("my store scored X/100") that renders the free diagnosis + a dynamic
 * OG image and a "Audit your store free" CTA. This is intentionally
 * SEPARATE from Community publishing (Pro-gated, curates the leaderboard):
 * sharing is the top-of-funnel viral loop, available to everyone.
 *
 * Security: we only write an opt-in `share_slug` on the user's OWN row
 * (RLS: "analyses: update own"). The public read path goes through the
 * SECURITY DEFINER `get_shared_audit` RPC which returns only diagnosis
 * fields — never the paid "cure" (top_fixes / persona). See migration
 * 0008_shared_audits.sql.
 */

const Input = z.object({ analysisId: z.string().uuid() });

export type ShareResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

export async function shareAnalysis(analysisId: string): Promise<ShareResult> {
  const parsed = Input.safeParse({ analysisId });
  if (!parsed.success) return { ok: false, error: "Invalid analysis id" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: analysis } = await supabase
    .from("analyses")
    .select("id, url, status, result, share_slug")
    .eq("id", analysisId)
    .eq("user_id", user.id)
    .single();
  if (!analysis) return { ok: false, error: "Analysis not found" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = analysis as any;
  if (a.status !== "succeeded" || !a.result) {
    return { ok: false, error: "Only completed audits can be shared" };
  }
  // Idempotent: already shared → return the existing slug.
  if (a.share_slug) return { ok: true, slug: a.share_slug as string };

  let domain = "store";
  try {
    domain = new URL(a.url).hostname.replace(/^www\./, "");
  } catch {
    /* uploaded screenshot or unparsable url — keep default */
  }
  const slug = `${slugify(domain)}-${Math.random().toString(36).slice(2, 8)}`;

  // Cast the builder: the hand-written Supabase Database type doesn't carry
  // the v4 share columns yet, so `.update(...)` collapses to `never`. Runtime
  // is correct (RLS "analyses: update own" allows it). Same known-types issue
  // documented in next.config.mjs.
  const { error } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from("analyses") as any
  )
    .update({ share_slug: slug, shared_at: new Date().toISOString() })
    .eq("id", analysisId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/analyzer/${analysisId}`);
  return { ok: true, slug };
}
