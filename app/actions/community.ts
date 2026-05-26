"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";
import { slugify } from "@/lib/utils";
import { rankFromResult } from "@/lib/ranking/tiers";

const PublishInput = z.object({
  analysisId: z.string().uuid(),
  displayName: z.string().min(1).max(60).optional(),
  anonymize: z.boolean().default(false),
});

export type PublishResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

/**
 * Snapshot an analysis row into the public `community_analyses` table.
 * We DELIBERATELY denormalize (instead of joining/exposing analyses RLS)
 * so that:
 *   • Unpublish is a soft-delete, original audit stays private.
 *   • Public reads have a stable shape regardless of internal column changes.
 *   • A bug in the analyzer can never accidentally expose private fields.
 */
export async function publishAnalysis(
  input: z.infer<typeof PublishInput>,
): Promise<PublishResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = PublishInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "Profile not found" };
  if (!PLANS[profile.plan].canPublish) {
    return {
      ok: false,
      error: "Publishing to Community is a Pro feature. Upgrade to share.",
    };
  }

  const { data: analysis } = await supabase
    .from("analyses")
    .select(
      "id, user_id, url, status, result, screenshot_url, buyer_persona, is_published",
    )
    .eq("id", parsed.data.analysisId)
    .eq("user_id", user.id)
    .single();
  if (!analysis) return { ok: false, error: "Analysis not found" };
  if (analysis.status !== "succeeded" || !analysis.result) {
    return { ok: false, error: "Only succeeded analyses can be published" };
  }
  if (analysis.is_published) {
    return { ok: false, error: "Already published" };
  }

  const result = analysis.result as Record<string, unknown>;
  const url = analysis.url ?? "";
  let domain = "uploaded-screenshot";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep default */
  }

  const baseSlug = `${slugify(domain)}-${Math.random().toString(36).slice(2, 8)}`;

  // v3.7 — compute leaderboard ranking at publish time and store the
  // results denormalized on the row. composite_score = score + bonus from
  // conversion potential (scenarios.meta_ads_good). rank_tier is the
  // human-readable tier label ("sovereign" / "magnate" / ...).
  //
  // Why denormalize: the community page sorts by composite_score DESC on
  // every load — computing this at read time would mean either a full
  // table scan or a complex CTE on each request. One write here = millions
  // of cheap reads.
  const ranking = rankFromResult({
    score: (result as { score?: number }).score,
    scenarios: (result as { scenarios?: { meta_ads_good?: number } }).scenarios,
  });

  const service = createSupabaseServiceClient();
  const { data: row, error: insErr } = await service
    .from("community_analyses")
    .insert({
      source_analysis_id: analysis.id,
      user_id: user.id,
      slug: baseSlug,
      display_name: parsed.data.anonymize
        ? null
        : parsed.data.displayName ?? profile.full_name ?? null,
      url,
      domain,
      score: (result as { score: number }).score,
      niche: domain.split(".")[0],
      summary: (result as { summary: string }).summary,
      scenarios: (result as { scenarios: unknown }).scenarios,
      category_scores: (result as { category_scores: unknown }).category_scores,
      annotations: (result as { annotations: unknown }).annotations,
      top_fixes: (result as { top_fixes: unknown }).top_fixes,
      buyer_persona: analysis.buyer_persona,
      persona_response: (result as { buyer_persona_response: unknown })
        .buyer_persona_response,
      screenshot_url: analysis.screenshot_url,
      composite_score: ranking.compositeScore,
      rank_tier: ranking.rankTier,
    })
    .select("slug")
    .single();
  if (insErr || !row) {
    return { ok: false, error: insErr?.message ?? "Insert failed" };
  }

  // Mark original as published (for UI state on /app/analyzer/[id])
  await service
    .from("analyses")
    .update({ is_published: true, published_at: new Date().toISOString() })
    .eq("id", analysis.id);

  revalidatePath("/app/community");
  revalidatePath(`/app/analyzer/${analysis.id}`);
  return { ok: true, slug: row.slug };
}

export async function unpublishAnalysis(
  analysisId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const service = createSupabaseServiceClient();
  await service
    .from("community_analyses")
    .update({ is_removed: true })
    .eq("source_analysis_id", analysisId)
    .eq("user_id", user.id);
  await service
    .from("analyses")
    .update({ is_published: false })
    .eq("id", analysisId)
    .eq("user_id", user.id);

  revalidatePath("/app/community");
  return { ok: true };
}

const ReportInput = z.object({
  slug: z.string().min(3).max(120),
  reason: z.string().min(3).max(500),
});

export async function reportCommunityAnalysis(
  input: z.infer<typeof ReportInput>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const parsed = ReportInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const { data: ca } = await supabase
    .from("community_analyses")
    .select("id")
    .eq("slug", parsed.data.slug)
    .single();
  if (!ca) return { ok: false, error: "Not found" };

  const { error } = await supabase.from("community_reports").insert({
    community_analysis_id: ca.id,
    reporter_id: user.id,
    reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markHelpful(slug: string) {
  const service = createSupabaseServiceClient();
  await service.rpc("community_helpful", { p_slug: slug });
  revalidatePath(`/app/community/${slug}`);
}
