import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { loadNicheWinnersModule } from "@/lib/library/niche-winners";
import { toClientAnalysis } from "@/lib/analyzer/client-payload";
import {
  analyzerMapSpineEnabled,
  analyzerReportV2Enabled,
} from "@/lib/flags";

/**
 * Public "full report" of ONE audit (migration 0047, analyses.share_full_report).
 *
 * The owner turns the flag on, per audit, when he shares a professional (Scale) audit on purpose. /s/<slug> then
 * renders the SAME read-only report the owner sees: every fix, the buyer persona, the saved Meta projection and the
 * Ads Optimizer output. It is read with the service client (the row is the owner's), and only when the flag is true
 * and the audit has succeeded without a blocked capture — anything else returns null and the page keeps showing
 * the diagnosis-only version.
 *
 * Read-only by construction: the viewer has no publish/run/unlock capabilities, fix tracks (an owner-only API) are
 * left out, and the simulator renders the saved projection without the run form.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FullReportProps = { initial: any; viewer: any; initialSimulation: any; nicheWinners: any };

export async function loadFullReportProps(slug: string): Promise<FullReportProps | null> {
  try {
    const service = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = service as any;
    const { data: row, error } = await db
      .from("analyses")
      .select("*")
      .eq("share_slug", slug)
      .eq("share_full_report", true)
      .eq("status", "succeeded")
      .maybeSingle();
    if (error || !row || !row.result) return null;
    if (row.result?.capture_blocked?.detected === true) return null;

    const { data: sim } = await db
      .from("meta_simulations")
      .select(
        "id, analysis_id, aov_usd, daily_budget_usd, product_margin_pct, notes, conservative, balanced, aggressive, status, error, started_at, finished_at, created_at",
      )
      .eq("analysis_id", row.id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nicheWinners = await loadNicheWinnersModule({
      status: row.status,
      url: row.url,
      summary: (row.result as { summary?: string } | null)?.summary ?? null,
      isPaid: true,
      stored: row.niche_winners,
    });

    return {
      initial: toClientAnalysis(row, { canSeeOptimizer: true, hasFullReport: true }),
      viewer: {
        canPublish: false,
        publishedSlug: null,
        fullName: null,
        isScale: true,
        isPaid: true,
        fullReport: true,
        unlockOffer: false,
        canRunMeta: true,
        metaLimit: null,
        metaUsed: 0,
        metaPerReport: false,
        mapSpine: analyzerMapSpineEnabled(),
        // the promo rail / bottom bar is an upsell for people who cannot run the simulator: not on a shared report
        metaPromo: false,
        reportV2: analyzerReportV2Enabled(),
        // fix tracks call an owner-only API; the full fixes list renders without them
        fixTracks: undefined,
      },
      initialSimulation: sim ?? null,
      nicheWinners,
    };
  } catch {
    return null;
  }
}
