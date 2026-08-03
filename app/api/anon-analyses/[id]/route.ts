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
  const { data, error } = await service
    .from("analyses")
    .select(
      "id, status, url, screenshot_url, result, preview_score, preview_summary, error, anon_id, user_id, started_at, created_at",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const row = data as {
    id: string;
    status: string;
    url: string | null;
    screenshot_url: string | null;
    result: {
      score?: number;
      summary?: string;
      annotations?: unknown;
      top_fixes?: { title?: string; impact?: string }[];
      category_scores?: unknown;
      ad_readiness?: unknown;
    } | null;
    preview_score: number | null;
    preview_summary: string | null;
    error: string | null;
    anon_id: string | null;
    user_id: string | null;
    started_at: string | null;
    created_at: string;
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

  const succeeded = status === "succeeded";
  const allFixes = Array.isArray(row.result?.top_fixes) ? row.result!.top_fixes! : [];
  const fixesTotal = allFixes.length;

  return NextResponse.json(
    {
      id: row.id,
      status,
      url: row.url,
      screenshot_url: row.screenshot_url,
      error: errMsg,
      preview_score: row.preview_score,
      preview_summary: row.preview_summary,
      // The free DIAGNOSIS — the same context a free logged-in user sees, so the
      // anonymous report is a real roadmap, not a bare number:
      score: row.result?.score ?? null,
      summary: succeeded ? (row.result?.summary ?? null) : null,
      annotations: succeeded ? (row.result?.annotations ?? []) : [],
      category_scores: succeeded ? (row.result?.category_scores ?? null) : null,
      ad_readiness: succeeded ? (row.result?.ad_readiness ?? null) : null,
      // Ranked fix TITLES + impact chips (context: "what's wrong"), but NOT the
      // how-to/why — that "cure" stays locked behind the free account.
      fixes: succeeded
        ? allFixes.map((f) => ({ title: f?.title ?? "", impact: f?.impact ?? "medium" }))
        : [],
      fixes_total: fixesTotal,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
