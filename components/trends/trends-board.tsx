"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Flame, ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";
import type {
  TrendItemHistory,
  TrendStatus,
  Direction,
  Provenance,
} from "@/lib/trends";

/**
 * Client board for a niche's trends. Operates entirely on the server-rendered
 * data — sorting and filtering happen in the browser with NO refetch and NO
 * model calls. Adds a "Movers this week" strip, sort/filter controls, and a
 * templated "what to do" hint per item.
 */

type SortKey = "movers" | "score" | "newest";
type FilterKey = "all" | "rising" | "cooling";

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
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        up
          ? "bg-success/10 text-success ring-success/20"
          : "bg-destructive/10 text-destructive ring-destructive/20",
      )}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      <span className="num">{score}</span>
    </span>
  );
}

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

/** Templated next-step hint — derived from the item's status/kind, no model call. */
function whatToDo(item: TrendItemHistory): string {
  const noun = item.kind === "product" ? "product" : "angle";
  switch (item.status) {
    case "cooling":
      return "Cooling — hold spend here; validate demand before committing more.";
    case "new":
      return `New signal — worth a fast test: spin up a ${noun} and audit it.`;
    case "accelerating":
      return `Heating up — double down: build a ${noun} around this and audit it.`;
    default:
      return "Steady demand — a dependable bet; refresh creative and re-audit.";
  }
}

/** Riser ranking for the movers strip: rising/new first, by delta then score. */
function riserScore(i: TrendItemHistory): number {
  if (i.status === "accelerating") return 1000 + (i.delta ?? 0);
  if (i.status === "new") return 500 + i.score / 100;
  return i.score / 1000; // cooling/sustained sink to the bottom
}

function applySortFilter(
  items: TrendItemHistory[],
  sort: SortKey,
  filter: FilterKey,
): TrendItemHistory[] {
  let out = items;
  if (filter === "rising") {
    out = out.filter(
      (i) => i.status === "accelerating" || i.status === "new",
    );
  } else if (filter === "cooling") {
    out = out.filter((i) => i.status === "cooling");
  }
  const sorted = [...out];
  if (sort === "score") {
    sorted.sort((a, b) => b.score - a.score);
  } else if (sort === "newest") {
    const rank = (s: TrendStatus) => (s === "new" ? 0 : 1);
    sorted.sort((a, b) => rank(a.status) - rank(b.status) || b.score - a.score);
  } else {
    // biggest movers
    sorted.sort((a, b) => riserScore(b) - riserScore(a));
  }
  return sorted;
}

function ControlButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-signal-500/15 text-signal-300 ring-1 ring-signal-400/30"
          : "text-white/50 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function ItemCard({
  item,
  nicheSlug,
}: {
  item: TrendItemHistory;
  nicheSlug: string;
}) {
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

      {/* Templated next step + per-row CTA */}
      <p className="mt-2 text-[11px] text-white/65 leading-relaxed">
        {whatToDo(item)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ProvenanceTag
          provenance={item.provenance}
          source={item.source}
          week={item.week}
        />
        <Link
          href={`/app/analyzer?from=trend&niche=${nicheSlug}`}
          className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-signal-300 hover:text-signal-200"
        >
          Audit against this
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function MoverCard({
  item,
  nicheSlug,
}: {
  item: TrendItemHistory;
  nicheSlug: string;
}) {
  return (
    <Link
      href={`/app/analyzer?from=trend&niche=${nicheSlug}`}
      className="group rounded-xl border border-signal-400/20 bg-signal-600/[0.04] p-3 transition-colors hover:border-signal-400/40"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-xs font-medium text-white/90">
          {item.item}
        </span>
        <StatusTag status={item.status} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Sparkline
          data={item.series.map((p) => p.score)}
          width={56}
          height={20}
          ariaLabel={`${item.item} trend`}
        />
        <span className="num text-sm text-signal-300">{item.score}</span>
        <WowDelta delta={item.delta} />
      </div>
    </Link>
  );
}

export function TrendsBoard({
  subniches,
  products,
  nicheSlug,
}: {
  subniches: TrendItemHistory[];
  products: TrendItemHistory[];
  nicheSlug: string;
}) {
  const [sort, setSort] = useState<SortKey>("movers");
  const [filter, setFilter] = useState<FilterKey>("all");

  const movers = useMemo(
    () =>
      [...subniches, ...products]
        .filter((i) => i.status === "accelerating" || i.status === "new")
        .sort((a, b) => riserScore(b) - riserScore(a))
        .slice(0, 3),
    [subniches, products],
  );

  const subView = useMemo(
    () => applySortFilter(subniches, sort, filter),
    [subniches, sort, filter],
  );
  const prodView = useMemo(
    () => applySortFilter(products, sort, filter),
    [products, sort, filter],
  );

  return (
    <div className="mt-6">
      {/* Movers this week */}
      {movers.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-4">
          <div className="flex items-center gap-1.5">
            <Flame className="size-3.5 text-signal-400" />
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-signal-300">
              Movers this week
            </h3>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {movers.map((m, i) => (
              <MoverCard key={`${m.item}-${i}`} item={m} nicheSlug={nicheSlug} />
            ))}
          </div>
        </div>
      )}

      {/* Controls — sort + filter, client-side, no refetch */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-white/30">
            Sort
          </span>
          <ControlButton active={sort === "movers"} onClick={() => setSort("movers")}>
            Biggest movers
          </ControlButton>
          <ControlButton active={sort === "score"} onClick={() => setSort("score")}>
            Highest score
          </ControlButton>
          <ControlButton active={sort === "newest"} onClick={() => setSort("newest")}>
            Newest
          </ControlButton>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-white/30">
            Filter
          </span>
          <ControlButton active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </ControlButton>
          <ControlButton
            active={filter === "rising"}
            onClick={() => setFilter("rising")}
          >
            Rising
          </ControlButton>
          <ControlButton
            active={filter === "cooling"}
            onClick={() => setFilter("cooling")}
          >
            Cooling
          </ControlButton>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 text-[11px] uppercase tracking-widest text-white/40">
            Sub-niches &amp; themes
          </h3>
          <div className="space-y-2.5">
            {subView.length === 0 && (
              <p className="text-sm text-white/35">Nothing matches this filter.</p>
            )}
            {subView.map((s, i) => (
              <ItemCard key={`${s.item}-${i}`} item={s} nicheSlug={nicheSlug} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[11px] uppercase tracking-widest text-white/40">
            Trending products
          </h3>
          <div className="space-y-2.5">
            {prodView.length === 0 && (
              <p className="text-sm text-white/35">Nothing matches this filter.</p>
            )}
            {prodView.map((p, i) => (
              <ItemCard key={`${p.item}-${i}`} item={p} nicheSlug={nicheSlug} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
