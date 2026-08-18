import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAnonToken } from "@/lib/anon/session";

/**
 * Polling endpoint for an ANONYMOUS (pre-login) audit.
 *
 * Ownership is proven by the signed httpOnly `ev_anon` cookie matching the
 * row's anon_id — never by an auth session (there is none). We read with the
 * service client (the row is unowned, so RLS can't authorize it) and then
 * enforce the cookie match ourselves.
 *
 * The response is a DELIBERATELY TRIMMED DTO: the anonymous reveal shows only
 * the "aha" (score + annotated screenshot). The paid "cure" (fix text, persona,
 * Meta projection) is never serialized to an anonymous client — we send counts,
 * not content. That's the gate, enforced at the network boundary, not just
 * hidden with CSS.
 */

const STALE_THRESHOLD_MS = 8 * 60 * 1000; // 8 minutes — matches the owned poller

// screenshot_url joins the poll payload for WP-3: the capture step persists it
// seconds into the run, so the anonymous waiting screen can show the visitor
// their own store instead of a spinner. It's their FIRST experience of the
// product, so the perceived-wait win matters most here.
const BASE_COLUMNS =
  "id, status, url, screenshot_url, preview_score, preview_summary, error, anon_id, user_id, started_at, created_at";

/**
 * `discovery_signals` (migration 0030) is optional for the same reason as the
 * owned poller: a deploy that lands before the migration must degrade to the
 * pre-WP-3 waiting screen, not 404 every poll. See app/api/analyses/[id].
 */
const OPTIONAL_COLUMNS = "discovery_signals";
let discoverySignalsAvailable: boolean | null = null;

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
  const anonToken = await getAnonToken();
  if (!anonToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const read = (columns: string) =>
    service.from("analyses").select(columns).eq("id", id).single();

  const tryOptional = discoverySignalsAvailable !== false;
  let { data, error } = await read(
    tryOptional ? `${BASE_COLUMNS}, ${OPTIONAL_COLUMNS}` : BASE_COLUMNS,
  );
  if (tryOptional) {
    if (!error) {
      discoverySignalsAvailable = true;
    } else if (isUndefinedColumn(error)) {
      discoverySignalsAvailable = false;
      console.warn(
        "[anon-analyses] discovery_signals column missing — apply migration 0030 to enable the progressive reveal",
      );
      ({ data, error } = await read(BASE_COLUMNS));
    }
  }

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const row = data as unknown as {
    id: string;
    status: string;
    url: string | null;
    screenshot_url: string | null;
    preview_score: number | null;
    preview_summary: string | null;
    error: string | null;
    anon_id: string | null;
    user_id: string | null;
    started_at: string | null;
    created_at: string;
    discovery_signals?: unknown;
  };

  // Only the creating browser may view an anonymous audit. Once it's been
  // claimed by an account (user_id set, anon_id cleared) the anon route no
  // longer serves it.
  if (row.user_id || !row.anon_id || row.anon_id !== anonToken) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let status = row.status;
  let errMsg = row.error;

  // Stale-job detection (no credit to refund on the anon path).
  if (status === "queued" || status === "running") {
    const startedRef = row.started_at ?? row.created_at;
    const age = Date.now() - new Date(startedRef).getTime();
    if (age > STALE_THRESHOLD_MS) {
      status = "refunded";
      errMsg =
        "Your audit timed out — the worker likely restarted. Try again in a minute.";
      await service
        .from("analyses")
        .update({ status: "refunded", error: errMsg, finished_at: new Date().toISOString() })
        .eq("id", id);
    }
  }

  // Minimal payload — the anon pending poller needs the status to know when to
  // refresh the page, plus (WP-3) the screenshot and the discovery signals it
  // renders while waiting. The succeeded report is server-rendered from the
  // full row by /audit/[id] (the identical-to-free AnalysisView), so no audit
  // content — score, fixes, persona — is served here. The gate is unchanged:
  // discovery signals are facts scraped from the visitor's OWN public store
  // (platform, rating, trust claims), not any part of the paid analysis.
  return NextResponse.json(
    {
      id: row.id,
      status,
      url: row.url,
      error: errMsg,
      screenshot_url: row.screenshot_url,
      discovery_signals: row.discovery_signals ?? null,
      preview_score: row.preview_score,
      preview_summary: row.preview_summary,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
