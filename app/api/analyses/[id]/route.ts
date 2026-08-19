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
// A full cold audit runs several sequential steps (screenshot capture,
// quick-score, discovery, the vision-AI analyzer, save) and each can retry.
// 5 minutes was too tight and refunded audits that were still legitimately
// working; 8 gives headroom now that per-step time is unblocked via the
// Inngest route's maxDuration.
const STALE_THRESHOLD_MS = 8 * 60 * 1000; // 8 minutes

// IMPORTANT: include meta_ads + is_published — they're needed by the
// AnalysisView for the Scale panel and Publish callout. We had a bug where
// leaving meta_ads out of the polling SELECT made the panel "disappear" after
// the first poll overwrote the SSR state.
//
// screenshot_url is what WP-3's progressive reveal renders: the capture step
// persists it long before the audit finishes, so the poller can show the real
// store while the vision call is still running.
const BASE_COLUMNS =
  "id, status, url, screenshot_url, result, rewrite, meta_ads, is_published, share_slug, preview_score, preview_summary, error, started_at, finished_at, created_at, credits_charged";

/**
 * WP-3 — `discovery_signals` (migration 0030) is selected OPTIONALLY.
 *
 * This endpoint is polled every 1.5s and its failure mode is a report that
 * never resolves, so it must not depend on a migration having been applied.
 * If the column isn't there yet, PostgREST answers 42703 and we retry once
 * without it, then remember the answer for the life of the lambda. That keeps
 * a code deploy that lands BEFORE the migration harmless instead of fatal.
 */
const OPTIONAL_COLUMNS = "discovery_signals";

/**
 * The "column isn't there" answer is cached, but only for a while. A permanent
 * latch would mean that applying migration 0030 AFTER the deploy leaves warm
 * lambdas serving the pre-WP-3 waiting screen until they happen to cold-start.
 * Self-healing on a timer — same idea as the ScreenshotOne breaker — costs one
 * extra query every 10 minutes in the un-migrated case and nothing once the
 * column exists.
 */
const MISSING_COLUMN_RECHECK_MS = 10 * 60_000;
let discoverySignalsMissingUntil = 0;

function isUndefinedColumn(err: { code?: string; message?: string } | null) {
  if (!err) return false;
  return (
    err.code === "42703" ||
    /column .* does not exist|could not find the .* column/i.test(err.message ?? "")
  );
}

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

  const read = (columns: string) =>
    supabase
      .from("analyses")
      .select(columns)
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

  const tryOptional = Date.now() >= discoverySignalsMissingUntil;
  let { data, error } = await read(
    tryOptional ? `${BASE_COLUMNS}, ${OPTIONAL_COLUMNS}` : BASE_COLUMNS,
  );
  if (tryOptional && error && isUndefinedColumn(error)) {
    discoverySignalsMissingUntil = Date.now() + MISSING_COLUMN_RECHECK_MS;
    console.warn(
      "[analyses] discovery_signals column missing — apply migration 0030 to enable the progressive reveal",
    );
    ({ data, error } = await read(BASE_COLUMNS));
  }

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // The column list is built at runtime (see OPTIONAL_COLUMNS), so supabase-js
  // can't infer the row from a string literal any more and resolves it to
  // `never`. Same loose-shape approach the anon poller and the report pages
  // already use: name the fields this handler actually reads.
  // Keeps the full record (the client needs every selected column — result,
  // meta_ads, screenshot_url…) while naming the few fields this handler reads.
  const row = data as unknown as Record<string, unknown> & {
    status: string;
    started_at: string | null;
    created_at: string;
    credits_charged: number | null;
  };

  // Stale-job detection
  if (row.status === "queued" || row.status === "running") {
    const startedRef = row.started_at ?? row.created_at;
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
          .update({ credits: prof.credits + (row.credits_charged ?? 1) })
          .eq("id", user.id);
      }

      return NextResponse.json(
        {
          ...row,
          status: "refunded",
          error:
            "Analysis timed out — the worker likely crashed or restarted. Your credit was refunded.",
          finished_at: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  return NextResponse.json(row, {
    headers: { "Cache-Control": "no-store" },
  });
}
