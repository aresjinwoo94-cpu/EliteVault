import Link from "next/link";
import { Sparkles, Trophy } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Leaderboard } from "@/components/community/leaderboard";
import type {
  PodiumItem,
} from "@/components/community/leaderboard-podium";
import type {
  LeaderboardItem,
} from "@/components/community/leaderboard-row";

export const metadata = {
  title: "Leaderboard",
  description:
    "The community leaderboard. Stores ranked by composite score — design quality + conversion potential. Published audits from real founders.",
};

// Force dynamic — the leaderboard changes with every new publish, and
// stale cached lists would defeat the "live ranking" feel.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{
    niche?: string;
    tier?: string;
    sort?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  // ── Main query: ranked rows ──
  // v3.7: ordered by composite_score by default. Other sorts still
  // available (most viewed, most recent, pure score) via ?sort=…
  let q = supabase
    .from("community_analyses")
    .select(
      "id, slug, display_name, url, domain, score, niche, summary, view_count, helpful_count, screenshot_url, created_at, is_featured, composite_score, rank_tier",
    )
    .eq("is_removed", false)
    .limit(PAGE_SIZE);

  if (sp.niche) q = q.eq("niche", sp.niche);
  if (sp.tier) q = q.eq("rank_tier", sp.tier);
  if (sp.q) q = q.or(`domain.ilike.%${sp.q}%,summary.ilike.%${sp.q}%`);

  const sort = sp.sort ?? "rank";
  if (sort === "score") {
    q = q.order("score", { ascending: false });
  } else if (sort === "views") {
    q = q.order("view_count", { ascending: false });
  } else if (sort === "recent") {
    q = q.order("created_at", { ascending: false });
  } else {
    // Default "rank": composite_score DESC. The denormalized column
    // (set at publish time + backfilled for old rows) means this is a
    // single indexed lookup — no per-row computation.
    q = q.order("composite_score", { ascending: false, nullsFirst: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: itemsRaw } = (await q) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = itemsRaw ?? [];

  // The "Hall of Fame" podium uses the top 3 ALL-TIME ranked rows, which
  // means we re-query without any filters to find them. (When the user
  // applies filters, the podium is hidden — see Leaderboard component.)
  const showPodium = !sp.q && !sp.niche && !sp.tier && sort === "rank";
  let podiumItems: PodiumItem[] = [];
  if (showPodium) {
    podiumItems = items.slice(0, 3).map((r) => ({
      id: r.id,
      slug: r.slug,
      domain: r.domain,
      display_name: r.display_name,
      niche: r.niche,
      composite_score: Number(r.composite_score ?? 0),
      rank_tier: r.rank_tier,
      screenshot_url: r.screenshot_url,
      url: r.url,
    }));
  }

  // Remaining rows below the podium (or all rows if filters are active)
  const rowsSource = showPodium ? items.slice(3) : items;
  const rows: LeaderboardItem[] = rowsSource.map((r) => ({
    id: r.id,
    slug: r.slug,
    domain: r.domain,
    display_name: r.display_name,
    niche: r.niche,
    url: r.url,
    composite_score: Number(r.composite_score ?? 0),
    rank_tier: r.rank_tier,
    view_count: r.view_count ?? 0,
    helpful_count: r.helpful_count ?? 0,
    screenshot_url: r.screenshot_url,
    summary: r.summary,
    is_featured: !!r.is_featured,
  }));

  // Distinct niches for the filter dropdown
  const { data: nicheRows } = await supabase
    .from("community_analyses")
    .select("niche")
    .eq("is_removed", false);
  const niches = Array.from(
    new Set(
      (nicheRows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r.niche)
        .filter(Boolean),
    ),
  ) as string[];

  return (
    <div className="p-6 md:p-10 lg:p-12 pt-10 md:pt-14 max-w-7xl mx-auto space-y-10 md:space-y-12">
      <header>
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-champagne-400" />
          <span className="text-xs uppercase tracking-widest text-white/40">
            Community
          </span>
          <Badge variant="gold">
            <Sparkles className="size-3" />
            Leaderboard
          </Badge>
        </div>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
          Where stores get{" "}
          <span className="italic text-gold-gradient">ranked</span>.
        </h1>
        <p className="mt-3 text-sm md:text-base text-white/55 max-w-2xl leading-relaxed">
          Every published audit gets a composite score (design quality +
          conversion potential) and a tier from{" "}
          <span className="text-white/80">Apprentice</span> to{" "}
          <span className="text-champagne-300">Sovereign</span>. Higher score =
          higher rank. Click any row to see the full annotated audit.
        </p>
        <p className="mt-4 text-[10px] uppercase tracking-widest text-white/30">
          AI estimates · Not affiliated with the analyzed brands
        </p>
      </header>

      <Leaderboard
        podiumItems={podiumItems}
        rows={rows}
        niches={niches}
        initialFilters={{
          q: sp.q ?? "",
          niche: sp.niche ?? null,
          tier: sp.tier ?? null,
          sort: (sort as "rank" | "score" | "views" | "recent") ?? "rank",
        }}
      />

      <p className="text-center text-xs text-white/35">
        Want your store ranked?{" "}
        <Link
          href="/app/analyzer"
          className="text-champagne-400 hover:text-champagne-300 transition-colors"
        >
          Run an analysis →
        </Link>{" "}
        Publish it from the audit page to enter the leaderboard.
      </p>
    </div>
  );
}
