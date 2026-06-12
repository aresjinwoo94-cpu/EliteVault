import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Compare · Community" };

const SCENARIO_LABELS: Record<string, string> = {
  organic: "Organic",
  meta_ads_bad: "Meta — bad",
  meta_ads_regular: "Meta — regular",
  meta_ads_good: "Meta — top",
};

const CATEGORY_LABELS: Record<string, string> = {
  color_integration: "Color",
  layout_proportion: "Layout",
  image_quality: "Imagery",
  technical_optimization: "Tech",
  niche_coherence: "Niche fit",
  cro_principles: "CRO",
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ slugs?: string }>;
}) {
  const sp = await searchParams;
  const slugs = (sp.slugs ?? "").split(",").filter(Boolean).slice(0, 3);

  if (slugs.length < 2) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <h1 className="font-serif text-3xl">Pick 2-3 audits to compare</h1>
        <p className="mt-2 text-white/55">
          Go back to the Community feed and tap the + on the cards you want.
        </p>
        <Link
          href="/app/community"
          className="mt-6 inline-block text-champagne-400"
        >
          ← Back to Community
        </Link>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: items } = await supabase
    .from("community_analyses")
    .select(
      "id, slug, display_name, url, domain, niche, score, summary, scenarios, category_scores, screenshot_url, top_fixes, persona_response",
    )
    .in("slug", slugs)
    .eq("is_removed", false);

  if (!items || items.length < 2) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <h1 className="font-serif text-3xl">Couldn't load enough audits</h1>
        <Link
          href="/app/community"
          className="mt-4 inline-block text-champagne-400"
        >
          ← Back to Community
        </Link>
      </div>
    );
  }

  // preserve order from the URL
  const ordered = slugs
    .map((s) => items.find((i) => i.slug === s))
    .filter(Boolean) as typeof items;

  const scenarioKeys = ["organic", "meta_ads_bad", "meta_ads_regular", "meta_ads_good"];
  const categoryKeys = Object.keys(CATEGORY_LABELS);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <header>
        <Link
          href="/app/community"
          className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="size-3" />
          Community feed
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight">
            Side-by-side comparison
          </h1>
          <Badge variant="ai">
            <Sparkles className="size-3" />
            {ordered.length} audits
          </Badge>
        </div>
        <p className="mt-2 text-sm text-white/55">
          The same data, lined up. Look at score deltas, conversion scenarios,
          category breakdowns and persona reactions across stores.
        </p>
      </header>

      {/* Header row: screenshots + score */}
      <div
        className={`grid gap-4`}
        style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(0, 1fr))` }}
      >
        {ordered.map((it) => {
          const shot =
            it.screenshot_url ??
            `https://s.wordpress.com/mshots/v1/${encodeURIComponent(it.url)}?w=800&h=560`;
          return (
            <Card key={it.id} className="p-0 overflow-hidden">
              <div className="relative aspect-[16/10] bg-obsidian-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot}
                  alt={it.domain}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950/80 via-transparent" />
              </div>
              <div className="p-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-4xl tnum text-gold-gradient leading-none">
                    {it.score}
                  </span>
                  <span className="text-xs text-white/40">/ 100</span>
                </div>
                <p className="mt-2 text-sm font-medium truncate">{it.domain}</p>
                <p className="text-xs text-white/40 truncate">{it.niche}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Scenarios row */}
      <ComparisonRow
        title="Conversion scenarios"
        columns={ordered}
        renderColumn={(it) => (
          <div className="space-y-2.5 mt-1">
            {scenarioKeys.map((k) => {
              const v = (it.scenarios as Record<string, number>)[k] ?? 0;
              return (
                <div key={k}>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-white/50">{SCENARIO_LABELS[k]}</span>
                    <span className="tnum text-white/85">
                      {(v * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/[0.04]">
                    <div
                      className="h-full bg-gradient-to-r from-champagne-500 to-champagne-300 rounded-full"
                      style={{ width: `${Math.min((v / 0.06) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      />

      <ComparisonRow
        title="Category breakdown"
        columns={ordered}
        renderColumn={(it) => (
          <div className="space-y-2 mt-1">
            {categoryKeys.map((k) => {
              const v = (it.category_scores as Record<string, number>)[k] ?? 0;
              return (
                <div
                  key={k}
                  className="flex justify-between text-xs"
                >
                  <span className="text-white/55">{CATEGORY_LABELS[k]}</span>
                  <span className="tnum text-white/85">{v}</span>
                </div>
              );
            })}
          </div>
        )}
      />

      <ComparisonRow
        title="Buyer persona reacts"
        columns={ordered}
        renderColumn={(it) => {
          const r = it.persona_response as
            | { would_buy: boolean; headline: string }
            | null;
          return (
            <div className="space-y-2 mt-1">
              {r ? (
                <>
                  <Badge variant={r.would_buy ? "success" : "danger"}>
                    {r.would_buy ? "Would buy" : "Would bounce"}
                  </Badge>
                  <p className="font-serif text-base leading-snug text-white/85">
                    "{r.headline}"
                  </p>
                </>
              ) : (
                <p className="text-xs text-white/40">No persona response</p>
              )}
            </div>
          );
        }}
      />

      <ComparisonRow
        title="Top 3 fixes"
        columns={ordered}
        renderColumn={(it) => (
          <ol className="space-y-1.5 mt-1">
            {((it.top_fixes as { title: string; impact: string }[]) ?? [])
              .slice(0, 3)
              .map((f, i) => (
                <li key={i} className="text-xs">
                  <span className="text-champagne-300">{i + 1}.</span>{" "}
                  <span className="text-white/75">{f.title}</span>
                </li>
              ))}
          </ol>
        )}
      />
    </div>
  );
}

function ComparisonRow<T>({
  title,
  columns,
  renderColumn,
}: {
  title: string;
  columns: T[];
  renderColumn: (col: T) => React.ReactNode;
}) {
  return (
    <section>
      <p className="text-xs uppercase tracking-widest text-white/40 mb-3">
        {title}
      </p>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((col, i) => (
          <Card key={i} className="p-4">
            {renderColumn(col)}
          </Card>
        ))}
      </div>
    </section>
  );
}
