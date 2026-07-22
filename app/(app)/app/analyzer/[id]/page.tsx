import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalysisView } from "@/components/analyzer/analysis-view";
import { PLANS } from "@/lib/stripe/plans";
import { getMetaRunUsage } from "@/lib/quota/guard";
import { resolveNiche, getNicheWinners } from "@/lib/library/niche-winners";

export const dynamic = "force-dynamic";

// Loose runtime shape — the columns we actually read off the analyses row.
// We deliberately don't use the Database type here because TS inference for
// our hand-written Supabase types collapses to `never` once you join multiple
// tables. Runtime data shape is correct; we just bypass strict typing.
interface AnalysisRow {
  id: string;
  status: string;
  url: string | null;
  screenshot_url: string | null;
  buyer_persona: unknown;
  result: unknown;
  rewrite: unknown;
  meta_ads: unknown;
  is_published: boolean;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  [k: string]: unknown;
}

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [analysisRes, profileRes] = await Promise.all([
    supabase
      .from("analyses")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("plan, full_name")
      .eq("id", user.id)
      .single(),
  ]);

  const analysis = analysisRes.data as AnalysisRow | null;
  if (!analysis) notFound();

  const profile = profileRes.data as
    | { plan: "free" | "pro" | "scale"; full_name: string | null }
    | null;

  // Fetch the published slug if this audit is on the community feed
  let publishedSlug: string | null = null;
  if (analysis.is_published) {
    const { data: pub } = await supabase
      .from("community_analyses")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("slug")
      .eq("source_analysis_id", id)
      .eq("is_removed", false)
      .maybeSingle();
    publishedSlug = (pub as { slug?: string } | null)?.slug ?? null;
  }

  const plan = PLANS[profile?.plan ?? "free"];
  // P1-7 — the Campaign Scenario Modeler is now available to Pro (1/mo) AND
  // Scale (unlimited). Free (metaRunsPerMonth = 0) can't run it.
  const canRunMeta = (plan.quotas.metaRunsPerMonth ?? 1) !== 0;

  // Latest Meta Campaign Scenario Modeler run for this analysis, plus the
  // month's usage counter. Fetch for anyone who CAN run the Meta block (Pro
  // + Scale); the simulator UI manages its own polling on the returned ID.
  let initialSimulation = null;
  let metaUsage: { limit: number | null; used: number } = { limit: 0, used: 0 };
  if (canRunMeta) {
    const [{ data: simRow }, usage] = await Promise.all([
      supabase
        .from("meta_simulations")
        .select(
          "id, analysis_id, aov_usd, daily_budget_usd, product_margin_pct, notes, conservative, balanced, aggressive, status, error, started_at, finished_at, created_at",
        )
        .eq("analysis_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getMetaRunUsage(user.id),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialSimulation = (simRow as any) ?? null;
    metaUsage = usage;
  }

  // Change 3 — "Winners in your niche" module. Detect the analyzed store's
  // niche (reusing the Library taxonomy) and pull the top 3 winners for it.
  // Pro/Scale get the real stores; Free gets a locked teaser where the real
  // data NEVER leaves the server (we send only a blurred-row count).
  const isPaid = (profile?.plan ?? "free") !== "free";
  const analysisResult = analysis.result as { summary?: string } | null;
  let nicheWinners: {
    nicheLabel: string;
    locked: boolean;
    winners: Awaited<ReturnType<typeof getNicheWinners>>["winners"];
    lockedCount: number;
  } | null = null;
  if (analysis.status === "succeeded") {
    const niche = resolveNiche({
      url: analysis.url,
      summary: analysisResult?.summary ?? null,
    });
    if (niche) {
      const data = await getNicheWinners(niche);
      if (data.winners.length > 0) {
        nicheWinners = isPaid
          ? {
              nicheLabel: data.nicheLabel,
              locked: false,
              winners: data.winners,
              lockedCount: data.winners.length,
            }
          : {
              nicheLabel: data.nicheLabel,
              locked: true,
              winners: [], // real data withheld from Free clients
              lockedCount: Math.min(3, data.winners.length),
            };
      }
    }
  }

  return (
    <AnalysisView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initial={analysis as any}
      viewer={{
        canPublish: plan.canPublish,
        publishedSlug,
        fullName: profile?.full_name ?? null,
        isScale: plan.unlocksScale,
        // P0.2 — Pro/Scale see the full "cure"; Free sees it blurred.
        isPaid,
        // P1-7 — Meta block access + monthly quota (null limit = unlimited).
        canRunMeta,
        metaLimit: metaUsage.limit,
        metaUsed: metaUsage.used,
      }}
      initialSimulation={initialSimulation}
      nicheWinners={nicheWinners}
    />
  );
}
