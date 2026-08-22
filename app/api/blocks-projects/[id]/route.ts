import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

/**
 * Polling endpoint for one Liquid Blocks project.
 *
 * Mirrors app/api/analyses/[id] in shape, with one deliberate difference: there
 * is no refund branch. A preview costs nothing, so a stalled run is marked
 * failed and that's the whole story — the user re-runs it.
 *
 * A run that stops answering is the failure this guards against. Chromium can
 * be OOM-killed by the platform without Inngest ever seeing an error, which
 * leaves the row on `capturing` and the browser polling forever. After the
 * threshold we call it: an honest "this didn't finish" beats a spinner.
 *
 * The columns returned are exactly what the panel renders. Notably absent:
 * anything resembling generated Liquid. There is none at this stage — and once
 * WP-D adds it, it is delivered only by the export action, after payment, and
 * must never be added to this list.
 */

/**
 * A cold Chromium start plus a slow storefront plus two captures can genuinely
 * take a couple of minutes, and the step budget itself is ~245s. 6 minutes
 * leaves room for one Inngest retry after a first attempt burns its budget.
 */
const STALE_THRESHOLD_MS = 6 * 60 * 1000;

const COLUMNS =
  "id, status, product_url, product_handle, product_json, design_tokens, preview_before_url, preview_after_url, error, created_at, updated_at";

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
    .from("blocks_projects")
    .select(COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const row = data as unknown as Record<string, unknown> & {
    status: string;
    created_at: string;
    updated_at: string | null;
  };

  if (row.status === "queued" || row.status === "capturing") {
    const since = new Date(row.updated_at ?? row.created_at).getTime();
    if (Date.now() - since > STALE_THRESHOLD_MS) {
      const message =
        "The preview didn't finish — the browser that measures your store stopped responding. Nothing was charged; try running it again.";
      const service = createSupabaseServiceClient();
      // `as any`: post-0001 tables resolve to `never` under the stale Database
      // type. See app/actions/blocks.ts.
      await (service.from("blocks_projects") as any)
        .update({
          status: "failed",
          error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      return NextResponse.json(
        { ...row, status: "failed", error: message },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
}
