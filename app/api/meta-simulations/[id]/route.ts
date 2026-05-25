import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

/**
 * Polling endpoint for a Meta Campaign Scenario Modeler run.
 *
 * Returns the current state of one meta_simulations row, scoped to the
 * authenticated user. Same stale-job safety net as /api/analyses/[id]:
 * if the run sits in queued/running past STALE_THRESHOLD_MS we mark it
 * failed so the UI can render a real failure state instead of spinning
 * forever. We do NOT refund anything here — simulations don't consume
 * analysis credits (bundled into the Scale subscription).
 */
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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

  const { data, error } = await supabase
    .from("meta_simulations")
    .select(
      "id, analysis_id, aov_usd, daily_budget_usd, product_margin_pct, notes, conservative, balanced, aggressive, status, error, started_at, finished_at, created_at",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Stale-job detection — same approach as the analyzer polling route.
  if (data.status === "queued" || data.status === "running") {
    const startedRef = data.started_at ?? data.created_at;
    const age = Date.now() - new Date(startedRef).getTime();
    if (age > STALE_THRESHOLD_MS) {
      const service = createSupabaseServiceClient();
      const message =
        "Simulation timed out — the worker likely crashed or restarted. Re-run when ready.";
      await service
        .from("meta_simulations")
        .update({
          status: "failed",
          error: message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", id);
      return NextResponse.json(
        {
          ...data,
          status: "failed",
          error: message,
          finished_at: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
