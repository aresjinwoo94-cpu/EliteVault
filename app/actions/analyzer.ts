"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { normalizeUrl } from "@/lib/utils";
import { BuyerPersonaSchema } from "@/ai/schemas";
import { PLANS } from "@/lib/stripe/plans";
import { assertQuota } from "@/lib/quota/guard";

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
  // Derive from the typed Plan (plan.id is PlanTier) rather than re-reading
  // profile.plan — avoids an extra access on the `never`-typed Supabase row.
  const isFree = plan.id === "free";

  // v4 conversion: the gate is now CREDIT BALANCE, not the plan flag.
  // A Free user with their welcome credit (profiles.credits default 1) can
  // run one real audit of their own store and hit the "wow" before any
  // paywall. The plan flag is only a defensive backstop now (all live
  // plans set unlocksAnalyzer:true).
  if (!plan.unlocksAnalyzer) {
    return {
      ok: false,
      error:
        "The Analyzer isn't available on your plan. Upgrade to start auditing your store.",
    };
  }

  // P0.4 — anti-abuse without buyer friction: the free audit requires a
  // verified email. Supabase sets email_confirmed_at once the user clicks
  // the confirmation/magic link (and for Google OAuth it's already set).
  // Paid users (who passed Stripe Checkout) are never blocked here. Combined
  // with the single welcome credit, this enforces "1 free audit per account"
  // without asking for a card up front.
  const emailVerified = Boolean(
    (user as { email_confirmed_at?: string | null }).email_confirmed_at ??
      (user as { confirmed_at?: string | null }).confirmed_at,
  );
  if (isFree && !emailVerified) {
    return {
      ok: false,
      error:
        "Verify your email to claim your free audit. Check your inbox for the confirmation link, then try again.",
    };
  }

  // Unified server-side quota gate. Backed by profiles.credits, so the
  // Analyzer's effective limit and behaviour are unchanged — this just routes
  // the check through the single quota guard the new features also use.
  const quota = await assertQuota(user.id, "analysis");
  if (!quota.ok) {
    return { ok: false, error: quota.reason };
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
      plan: profile.plan,
      url: url ?? undefined,
      screenshotUrl: parsed.data.screenshotUrl,
      persona: parsed.data.persona ?? null,
      runRewrite: plan.unlocksScale,
      // P1.1 — model tiering by cost. The free audit runs on the cheap/fast
      // model (Gemini Flash-Lite tier) so its marginal cost stays in cents;
      // paid audits use the premium model. `fast` maps to provider.fast in
      // ai/provider.ts (GEMINI_MODEL_FAST). Defaults to premium for paid.
      fast: isFree,
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
