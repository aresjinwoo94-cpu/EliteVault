import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { CommunityFeed } from "@/components/community/feed";

export const metadata = { title: "Community" };

const PAGE_SIZE = 24;

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ niche?: string; sort?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  let q = supabase
    .from("community_analyses")
    .select(
      "id, slug, display_name, url, domain, score, niche, summary, view_count, helpful_count, screenshot_url, created_at, is_featured",
    )
    .eq("is_removed", false)
    .limit(PAGE_SIZE);

  if (sp.niche) q = q.eq("niche", sp.niche);
  if (sp.q) q = q.or(`domain.ilike.%${sp.q}%,summary.ilike.%${sp.q}%`);

  if (sp.sort === "score") {
    q = q.order("score", { ascending: false });
  } else if (sp.sort === "views") {
    q = q.order("view_count", { ascending: false });
  } else {
    q = q.order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  }

  const { data: items } = await q;

  // Niche list (distinct)
  const { data: nicheRows } = await supabase
    .from("community_analyses")
    .select("niche")
    .eq("is_removed", false);
  const niches = Array.from(
    new Set((nicheRows ?? []).map((r) => r.niche).filter(Boolean)),
  ) as string[];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <header>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-white/40">
            Community
          </span>
          <Badge variant="ai">
            <Sparkles className="size-3" />
            Audits shared by users
          </Badge>
        </div>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">
          What the community is{" "}
          <span className="italic text-gold-gradient">tearing apart</span>.
        </h1>
        <p className="mt-2 text-sm text-white/55 max-w-2xl">
          Real audits from real founders, on real stores. Click any entry to
          see the annotated screenshot, scores, persona response and top fixes.
          Pick 2-3 with the compare button and view them side-by-side.
        </p>
        <p className="mt-3 text-[10px] uppercase tracking-widest text-white/30">
          AI estimates. Not affiliated with the analyzed brands.
        </p>
      </header>

      <CommunityFeed
        initialItems={items ?? []}
        niches={niches}
        initialFilters={{
          niche: sp.niche ?? null,
          sort: (sp.sort as "recent" | "score" | "views" | undefined) ?? "recent",
          q: sp.q ?? "",
        }}
      />

      <p className="text-center text-xs text-white/30">
        Want to share your own audit?{" "}
        <Link
          href="/app/analyzer"
          className="text-champagne-400 hover:text-champagne-300 transition-colors"
        >
          Run an analysis →
        </Link>
      </p>
    </div>
  );
}
