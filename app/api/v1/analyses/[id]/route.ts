import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/analyses/[id]
 * Returns the analysis. Only readable by the user who owns the API key
 * that created it.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("analyses")
    .select(
      "id, status, url, screenshot_url, result, rewrite, meta_ads, error, created_at, started_at, finished_at",
    )
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
