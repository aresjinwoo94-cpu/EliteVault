import { NextResponse } from "next/server";
import { getOwner } from "@/lib/admin/guard";
import * as M from "@/lib/admin/metrics";

/**
 * Métricas privadas del dueño. Gateadas por getOwner() (email en ADMIN_EMAILS /
 * INTERNAL_EMAILS). Las consume el panel en /app/owner.
 *
 *   GET /api/admin/metrics/kpis?range=7d
 *   GET /api/admin/metrics/revenue-series?range=7d
 *   GET /api/admin/metrics/funnel?range=7d
 *   GET /api/admin/metrics/almost-buyers?range=7d
 *   GET /api/admin/metrics/recent-subscriptions
 *   GET /api/admin/metrics/live-visitors
 *   GET /api/admin/metrics/demographics?range=7d
 */
export const dynamic = "force-dynamic";

function parseRange(req: Request): M.Range {
  const r = new URL(req.url).searchParams.get("range") ?? "";
  return (M.RANGES as string[]).includes(r) ? (r as M.Range) : "7d";
}

export async function GET(req: Request, ctx: { params: Promise<{ metric: string }> }) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { metric } = await ctx.params;
  const range = parseRange(req);

  try {
    let data: unknown;
    switch (metric) {
      case "kpis": data = await M.getKpis(range); break;
      case "revenue-series": data = await M.getRevenueSeries(range); break;
      case "funnel": data = await M.getFunnel(range); break;
      case "almost-buyers": data = await M.getAlmostBuyers(range); break;
      case "recent-subscriptions": data = await M.getRecentSubscriptions(); break;
      case "live-visitors": data = await M.getLiveVisitors(); break;
      case "demographics": data = await M.getDemographics(range); break;
      default: return NextResponse.json({ error: "unknown metric" }, { status: 404 });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
