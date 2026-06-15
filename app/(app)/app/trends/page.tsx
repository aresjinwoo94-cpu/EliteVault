import Link from "next/link";
import { TrendingUp, TrendingDown, Sparkles, Info, ArrowRight } from "lucide-react";
import {
  listNiches,
  getNicheTrendHistory,
  type Direction,
  type Provenance,
  type TrendStatus,
  type TrendItemHistory,
} from "@/lib/trends";
import { NicheSearch } from "@/components/trends/niche-search";
import { Sparkline } from "@/components/ui/sparkline";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refreshTrendsNow } from "@/app/actions/trends";
import { cn } from "@/lib/utils";

export const metadata = { title: "Trends" };
export const dynamic = "force-dynamic";

function fmtWeek(week: string): string {
  return new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DirPill({ direction, score }: { direction: Direction; score: number }) {
  const up = direction === "up";
  return (
    <span
      className={
        up
          ? "inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success ring-1 ring-success/20"
          : "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive ring-1 ring-destructive/20"
      }
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      <span className="font-mono tabular-nums">{score}</span>
    </span>
  );
}

function ProvenanceTag({
  provenance,
  source,
  week,
}: {
  provenance: Provenance;
  source: string | null;
  week: string;
}) {
  return (
    <span className="text-[10px] text-white/35">
      {provenance === "sourced" && source ? `Source: ${source}` : "AI-estimated"}
      {" · "}
      week of {fmtWeek(week)}
    </span>
  );
}

/** Momentum status — teal for new/rising, destructive for cooling, muted otherwise. */
function StatusTag({ status }: { status: TrendStatus }) {
  const map = {
    new: { c: "text-signal-300 ring-signal-400/30 bg-signal-600/10", label: "New" },
    accelerating: {
      c: "text-signal-300 ring-signal-400/30 bg-signal-600/10",
      label: "Rising",
    },
    cooling: {
      c: "text-destructive ring-destructive/30 bg-destructive/10",
      label: "Cooling",
    },
    sustained: { c: "text-white/45 ring-white/10 bg-white/[0.03]", label: "Steady" },
  } as const;
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ring-1",
        s.c,
      )}
    >
      {s.label}
    </span>
  );
}

/** Week-over-week delta, MetricChip convention (▲ success / ▼ destructive). */
function WowDelta({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="num text-[11px] text-white/30">first week</span>;
  }
  if (delta === 0) {
    return <span className="num text-[11px] text-white/40">±0</span>;
  }
  const up = delta > 0;
  return (
    <span className={cn("num text-[11px]", up ? "text-success" : "text-destructive")}>
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

/** One enriched trend card — name + status + score, momentum sparkline + Δ. */
function TrendItemCard({ item }: { item: TrendItemHistory }) {
  const cooling = item.status === "cooling";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-white/90">
            {item.item}
          </span>
          <StatusTag status={item.status} />
        </div>
        <DirPill direction={item.direction} score={item.score} />
      </div>

      {/* Momentum row — sparkline + week-over-week delta from cached history */}
      <div className="mt-2.5 flex items-center gap-3">
        <Sparkline
          data={item.series.map((p) => p.score)}
          className={cooling ? "text-destructive" : "text-signal-400"}
          ariaLabel={`${item.item} score trend`}
        />
        <WowDelta delta={item.delta} />
        <span className="text-[10px] uppercase tracking-wider text-white/30">
          wk / wk
        </span>
      </div>

      {item.rationale && (
        <p className="mt-2 text-xs text-white/50 leading-relaxed">
          {item.rationale}
        </p>
      )}
      <div className="mt-2">
        <ProvenanceTag
          provenance={item.provenance}
          source={item.source}
          week={item.week}
        />
      </div>
    </div>
  );
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ niche?: string }>;
}) {
  const sp = await searchParams;
  const slug = sp.niche ?? null;
  const niches = await listNiches();
  const trends = slug ? await getNicheTrendHistory(slug) : null;

  // Internal-only "refresh now" control (gated to INTERNAL_EMAILS).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const internalAllow = (process.env.INTERNAL_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isInternal = internalAllow.includes((user?.email ?? "").toLowerCase());

  return (
    <div className="min-h-screen bg-obsidian-950 px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          Retention · refreshed weekly
        </p>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl tracking-tight">
          Trends
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
          What&apos;s rising and falling in your niche this week — sub-niches and
          products with momentum, so you know what to stock, test, and audit
          against.
        </p>

        {/* Honest provenance banner */}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[11px] text-white/45 max-w-2xl">
          <Info className="size-3.5 shrink-0 mt-0.5 text-white/30" />
          <span>
            These are <strong className="text-white/70">AI estimates</strong>{" "}
            from market knowledge, refreshed once a week and cached — not live
            scraped data. Use them as directional signal, not precise stats.
          </span>
        </div>

        {isInternal && (
          <form action={refreshTrendsNow} className="mt-3">
            {slug && <input type="hidden" name="niche" value={slug} />}
            <button
              type="submit"
              className="rounded-md border border-signal-500/30 bg-signal-500/10 px-3 py-1.5 text-xs text-signal-300 hover:bg-signal-500/20 transition-colors"
            >
              ↻ Refresh {slug ? "this niche" : "all niches"} now (internal)
            </button>
          </form>
        )}

        <div className="mt-8">
          <NicheSearch niches={niches} selected={slug} />
        </div>

        {/* No niche picked yet */}
        {!trends && (
          <div className="mt-12 rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
            <Sparkles className="mx-auto size-6 text-champagne-400/70" />
            <p className="mt-3 text-sm text-white/55">
              Pick your niche above to see what&apos;s trending this week.
            </p>
          </div>
        )}

        {/* Niche selected but not refreshed yet */}
        {trends && !trends.week && (
          <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
            <h2 className="font-serif text-2xl tracking-tight">
              {trends.niche.name}
            </h2>
            <p className="mt-3 text-sm text-white/50 max-w-md mx-auto leading-relaxed">
              Trends for this niche haven&apos;t been refreshed yet. The weekly
              job lands fresh signals every Monday — check back soon.
            </p>
          </div>
        )}

        {/* Trends */}
        {trends && trends.week && (
          <div className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl tracking-tight">
                  {trends.niche.name}
                </h2>
                <p className="mt-1 text-xs text-white/40">
                  Week of {fmtWeek(trends.week)} · {trends.subniches.length}{" "}
                  sub-niches · {trends.products.length} products
                </p>
              </div>
              <Link
                href={`/app/analyzer?from=trend&niche=${trends.niche.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-champagne-400 px-4 py-2 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 transition-colors"
              >
                Audit your store against this trend
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Sub-niches */}
              <section>
                <h3 className="text-[11px] uppercase tracking-widest text-white/40 mb-3">
                  Sub-niches & themes
                </h3>
                <div className="space-y-2.5">
                  {trends.subniches.length === 0 && (
                    <p className="text-sm text-white/35">No signals this week.</p>
                  )}
                  {trends.subniches.map((s, i) => (
                    <TrendItemCard key={`${s.item}-${i}`} item={s} />
                  ))}
                </div>
              </section>

              {/* Products */}
              <section>
                <h3 className="text-[11px] uppercase tracking-widest text-white/40 mb-3">
                  Trending products
                </h3>
                <div className="space-y-2.5">
                  {trends.products.length === 0 && (
                    <p className="text-sm text-white/35">No products this week.</p>
                  )}
                  {trends.products.map((p, i) => (
                    <TrendItemCard key={`${p.item}-${i}`} item={p} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
