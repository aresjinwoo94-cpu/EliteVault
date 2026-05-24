"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { normalizeUrl } from "@/lib/utils";
import { BuyerPersonaSchema } from "@/ai/schemas";
import { PLANS } from "@/lib/stripe/plans";

const CreateAnalysisInput = z.object({
  url: z.string().min(3).optional(),
  screenshotUrl: z.string().url().optional(),
  persona: BuyerPersonaSchema.optional(),
});

export type CreateAnalysisResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createAnalysis(
  input: z.infer<typeof CreateAnalysisInput>,
): Promise<CreateAnalysisResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = CreateAnalysisInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" };
  }
  if (!parsed.data.url && !parsed.data.screenshotUrl) {
    return { ok: false, error: "Provide a URL or upload a screenshot" };
  }
  const url = parsed.data.url ? normalizeUrl(parsed.data.url) : null;

  // Plan gating + credit accounting
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, credits")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "Profile not found" };

  const plan = PLANS[profile.plan];
  // v2: Free has zero analyses. Hard gate.
  if (!plan.unlocksAnalyzer) {
    return {
      ok: false,
      error:
        "The Analyzer is a Pro feature. Upgrade to start auditing your own store.",
    };
  }
  if (profile.credits <= 0) {
    return {
      ok: false,
      error: "You're out of credits for this billing period.",
    };
  }

  // Deduct credit BEFORE queueing; refunded by Inngest on failure.
  const { error: decErr } = await supabase
    .from("profiles")
    .update({ credits: profile.credits - 1 })
    .eq("id", user.id);
  if (decErr) return { ok: false, error: decErr.message };

  // Create row
  const { data: row, error: insErr } = await supabase
    .from("analyses")
    .insert({
      user_id: user.id,
      url,
      screenshot_url: parsed.data.screenshotUrl ?? null,
      buyer_persona: parsed.data.persona ?? null,
      status: "queued",
      credits_charged: 1,
    })
    .select("id")
    .single();
  if (insErr || !row) {
    // Refund on failure
    await supabase
      .from("profiles")
      .update({ credits: profile.credits })
      .eq("id", user.id);
    return { ok: false, error: insErr?.message ?? "Could not create analysis" };
  }

  // Kick the Inngest pipeline
  await inngest.send({
    name: "analysis/requested",
    data: {
      analysisId: row.id,
      userId: user.id,
      url: url ?? undefined,
      screenshotUrl: parsed.data.screenshotUrl,
      persona: parsed.data.persona ?? null,
      runRewrite: plan.unlocksScale,
    },
  });

  revalidatePath("/app");
  return { ok: true, id: row.id };
}

export async function startAnalysisAndRedirect(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  const personaRaw = formData.get("persona");
  const persona =
    personaRaw && typeof personaRaw === "string"
      ? (JSON.parse(personaRaw) as Record<string, unknown>)
      : undefined;

  const res = await createAnalysis({ url: url || undefined, persona: persona as any });
  if (!res.ok) {
    redirect(`/app/analyzer?error=${encodeURIComponent(res.error)}`);
  }
  redirect(`/app/analyzer/${res.id}`);
}
