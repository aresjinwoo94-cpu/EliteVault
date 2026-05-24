import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

/**
 * Polling endpoint for an analysis. Returns the current state.
 *
 * Safety net: if an analysis has been "queued" or "running" for more than
 * STALE_THRESHOLD_MS, we treat it as dead (e.g. Inngest crashed, dev server
 * restarted, network hiccup) and mark it as `refunded` so the UI shows a
 * proper failure state instead of spinning forever. Refunds the credit too.
 *
 * Without this, killing the dev server mid-job leaves the row in "running"
 * indefinitely and the user's browser polls forever.
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
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("analyses")
    .select(
      // IMPORTANT: include meta_ads + is_published — they're needed by
      // the AnalysisView for the Scale panel and Publish callout. We had
      // a bug where leaving meta_ads out of the polling SELECT made the
      // panel "disappear" after the first poll overwrote the SSR state.
      "id, status, url, screenshot_url, result, rewrite, meta_ads, is_published, error, started_at, finished_at, created_at, credits_charged",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Stale-job detection
  if (data.status === "queued" || data.status === "running") {
    const startedRef = data.started_at ?? data.created_at;
    const age = Date.now() - new Date(startedRef).getTime();
    if (age > STALE_THRESHOLD_MS) {
      const service = createSupabaseServiceClient();
      await service
        .from("analyses")
        .update({
          status: "refunded",
          error:
            "Analysis timed out — the worker likely crashed or restarted. Your credit was refunded.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", id);

      // refund the credit
      const { data: prof } = await service
        .from("profiles")
        .select("credits")
        .eq("id", user.id)
        .single();
      if (prof) {
        await service
          .from("profiles")
          .update({ credits: prof.credits + (data.credits_charged ?? 1) })
          .eq("id", user.id);
      }

      return NextResponse.json(
        {
          ...data,
          status: "refunded",
          error:
            "Analysis timed out — the worker likely crashed or restarted. Your credit was refunded.",
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
