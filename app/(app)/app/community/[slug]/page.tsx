import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, ThumbsUp } from "lucide-react";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConversionGauges } from "@/components/analyzer/conversion-gauges";
import { CategoryRadar } from "@/components/analyzer/category-radar";
import { AnnotationsOverlay } from "@/components/analyzer/annotations-overlay";
import { PersonaResponse } from "@/components/analyzer/persona-response";
import { TopFixes } from "@/components/analyzer/top-fixes";
import { ReportButton } from "@/components/community/report-button";
import { HelpfulButton } from "@/components/community/helpful-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `${slug.replace(/-[^-]+$/, "")} audit · Community` };
}

export default async function CommunityAnalysisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("community_analyses")
    .select("*")
    .eq("slug", slug)
    .eq("is_removed", false)
    .single();

  if (!data) notFound();

  // Increment view count (fire-and-forget, service role bypasses RLS)
  const service = createSupabaseServiceClient();
  service.rpc("community_increment_view", { p_slug: slug }).then(() => {});

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/app/community"
            className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Community feed
          </Link>
          <h1 className="mt-2 font-serif text-3xl md:text-4xl tracking-tight truncate">
            {data.url}
          </h1>
          <p className="text-xs text-white/40 mt-1">
            by {data.display_name ?? "Anonymous founder"} ·{" "}
            {new Date(data.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40 shrink-0">
          <span className="flex items-center gap-1">
            <Eye className="size-3.5" />
            {data.view_count}
          </span>
          <HelpfulButton slug={slug} count={data.helpful_count} />
          <ReportButton slug={slug} />
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card className="relative overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-champagne-400/15 blur-3xl" />
          <p className="text-xs uppercase tracking-widest text-white/40">
            Overall score
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-7xl tnum text-gold-gradient leading-none">
              {data.score}
            </span>
            <span className="text-xl text-white/40">/ 100</span>
          </div>
          {data.niche && (
            <Badge variant="default" className="mt-3">
              {data.niche}
            </Badge>
          )}
          <p className="mt-6 text-sm text-white/65 leading-relaxed">
            {data.summary}
          </p>
        </Card>
        <ConversionGauges scenarios={data.scenarios} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <AnnotationsOverlay
          imageUrl={
            data.screenshot_url ??
            `https://s.wordpress.com/mshots/v1/${encodeURIComponent(data.url)}?w=1280&h=900`
          }
          annotations={data.annotations}
        />
        <CategoryRadar scores={data.category_scores} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {data.persona_response && (
          <PersonaResponse response={data.persona_response} />
        )}
        <TopFixes fixes={data.top_fixes} />
      </div>

      <p className="text-center text-[10px] uppercase tracking-widest text-white/30">
        AI-generated audit. Estimates, not facts. Not affiliated with the
        analyzed brand.
      </p>
    </div>
  );
}
