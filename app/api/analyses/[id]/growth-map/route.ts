import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnalysisResult } from "@/lib/supabase/types";
import { getOrBuildGrowthMap, gateForViewer } from "@/lib/growth-map/build";

/**
 * Growth Map payload for one analysis (spec §5/§6/§7).
 *
 * Additive endpoint — reads the analysis the caller already owns, returns the
 * cached Growth Map or builds+caches it on first request. Free/Pro gating is
 * applied here so the store-specific "escape route" (nodes ahead) never reaches
 * a Free client. Never touches the analyzer pipeline.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [{ data: analysisRaw, error }, { data: profileRaw }] = await Promise.all([
    supabase
      .from("analyses")
      .select("id, status, url, result, growth_map")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase.from("profiles").select("plan").eq("id", user.id).single(),
  ]);

  // Our hand-written Supabase types collapse selects to `never` (see the note in
  // analyzer/[id]/page.tsx). Cast to the runtime shape we actually read.
  const analysis = analysisRaw as unknown as {
    status: string;
    url: string | null;
    result: unknown;
    growth_map: unknown;
  } | null;
  const profile = profileRaw as unknown as { plan?: string } | null;

  if (error || !analysis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // The map only exists for a finished audit with a real result.
  if (analysis.status !== "succeeded" || !analysis.result) {
    return NextResponse.json({ error: "not_ready" }, { status: 409 });
  }

  const isPaid = (profile?.plan ?? "free") !== "free";

  try {
    const data = await getOrBuildGrowthMap({
      analysisId: id,
      cached: analysis.growth_map,
      result: analysis.result as AnalysisResult,
      url: analysis.url,
    });
    return NextResponse.json(gateForViewer(data, isPaid), {
      // Short client cache — the payload is stable once built.
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error("[growth-map] build failed:", (err as Error).message);
    return NextResponse.json({ error: "build_failed" }, { status: 500 });
  }
}
