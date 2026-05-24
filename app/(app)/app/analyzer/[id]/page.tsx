import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalysisView } from "@/components/analyzer/analysis-view";
import { PLANS } from "@/lib/stripe/plans";

export const dynamic = "force-dynamic";

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

  const [{ data: analysis }, { data: profile }] = await Promise.all([
    supabase.from("analyses").select("*").eq("id", id).eq("user_id", user.id).single(),
    supabase
      .from("profiles")
      .select("plan, full_name")
      .eq("id", user.id)
      .single(),
  ]);

  if (!analysis) notFound();

  // Fetch the published slug if this audit is on the community feed
  let publishedSlug: string | null = null;
  if (analysis.is_published) {
    const { data: pub } = await supabase
      .from("community_analyses")
      .select("slug")
      .eq("source_analysis_id", id)
      .eq("is_removed", false)
      .maybeSingle();
    publishedSlug = pub?.slug ?? null;
  }

  const plan = PLANS[profile?.plan ?? "free"];

  return (
    <AnalysisView
      initial={analysis}
      viewer={{
        canPublish: plan.canPublish,
        publishedSlug,
        fullName: profile?.full_name ?? null,
        isScale: plan.unlocksScale,
      }}
    />
  );
}
