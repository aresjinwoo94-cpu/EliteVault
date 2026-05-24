import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKey } from "@/lib/api-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { normalizeUrl } from "@/lib/utils";
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

  // credit check
  const { data: profile } = await service
    .from("profiles")
    .select("credits")
    .eq("id", auth.userId)
    .single();
  if (!profile) return NextResponse.json({ error: "profile_missing" }, { status: 500 });
  if (profile.credits <= 0) {
    return NextResponse.json(
      { error: "out_of_credits", detail: "Your plan's credit allowance is exhausted." },
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
