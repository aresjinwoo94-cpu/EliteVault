import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKey } from "@/lib/api-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { assertQuota } from "@/lib/quota/guard";
import { inngest } from "@/inngest/client";
import { normalizeUrl } from "@/lib/utils";
import { findReusableAnalysis } from "@/lib/analysis/reuse";
import { BuyerPersonaSchema } from "@/ai/schemas";

/**
 * Public REST API — Scale plan only.
 *
 * POST /api/v1/analyses
 * Body: { url: string, persona?: BuyerPersona, run_rewrite?: boolean }
 * Returns: 202 Accepted { id, status: "queued", check_at: "/api/v1/analyses/<id>" }
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  const Body = z.object({
    url: z.string().min(3),
    persona: BuyerPersonaSchema.optional(),
    run_rewrite: z.boolean().default(true),
    /** Bypass the reuse check and force a fresh audit. */
    force: z.boolean().optional(),
  });
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const url = normalizeUrl(parsed.data.url);

  const service = createSupabaseServiceClient();

  // Idempotency — a script that retries on a timeout (or loops over a list
  // with duplicates) must not burn a credit per attempt. Same rules as the
  // in-app action; see lib/analysis/reuse.ts.
  const reusable = await findReusableAnalysis(service, auth.userId, url, {
    force: parsed.data.force,
  });
  if (reusable) {
    return NextResponse.json(
      {
        id: reusable.id,
        status: reusable.status,
        reused: true,
        check_at: `/api/v1/analyses/${reusable.id}`,
      },
      { status: 200 },
    );
  }

  // Unified server-side quota gate (backed by profiles.credits).
  const { data: profile } = await service
    .from("profiles")
    .select("credits, plan")
    .eq("id", auth.userId)
    .single();
  if (!profile) return NextResponse.json({ error: "profile_missing" }, { status: 500 });
  const quota = await assertQuota(auth.userId, "analysis");
  if (!quota.ok) {
    return NextResponse.json(
      { error: "out_of_credits", detail: quota.reason },
      { status: 402 },
    );
  }

  await service
    .from("profiles")
    .update({ credits: profile.credits - 1 })
    .eq("id", auth.userId);

  const { data: row, error } = await service
    .from("analyses")
    .insert({
      user_id: auth.userId,
      url,
      buyer_persona: parsed.data.persona ?? null,
      status: "queued",
      credits_charged: 1,
    })
    .select("id")
    .single();
  if (error || !row) {
    await service
      .from("profiles")
      .update({ credits: profile.credits })
      .eq("id", auth.userId);
    return NextResponse.json(
      { error: "insert_failed", detail: error?.message },
      { status: 500 },
    );
  }

  await inngest.send({
    name: "analysis/requested",
    data: {
      analysisId: row.id,
      userId: auth.userId,
      plan: (profile as { plan?: string }).plan ?? null,
      url,
      persona: parsed.data.persona ?? null,
      runRewrite: parsed.data.run_rewrite,
    },
  });

  return NextResponse.json(
    {
      id: row.id,
      status: "queued",
      check_at: `/api/v1/analyses/${row.id}`,
    },
    { status: 202 },
  );
}
