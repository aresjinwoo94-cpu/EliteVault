import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalysisView } from "@/components/analyzer/analysis-view";
import { PLANS } from "@/lib/stripe/plans";

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

  // v3.0 — Latest Meta Campaign Scenario Modeler run for this analysis.
  // We fetch only for Scale users (no point loading + then ignoring on lower
  // plans). The simulator UI manages its own polling on the returned ID.
  let initialSimulation = null;
  if (plan.unlocksScale) {
    const { data: simRow } = await supabase
      .from("meta_simulations")
      .select(
        "id, analysis_id, aov_usd, daily_budget_usd, product_margin_pct, notes, conservative, balanced, aggressive, status, error, started_at, finished_at, created_at",
      )
      .eq("analysis_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialSimulation = (simRow as any) ?? null;
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
        isPaid: (profile?.plan ?? "free") !== "free",
      }}
      initialSimulation={initialSimulation}
    />
  );
}
