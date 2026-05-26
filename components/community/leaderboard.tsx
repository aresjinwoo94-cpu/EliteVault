"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowLeftRight, X, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RANK_TIERS } from "@/lib/ranking/tiers";
import {
  LeaderboardPodium,
  type PodiumItem,
} from "./leaderboard-podium";
import {
  LeaderboardRow,
  type LeaderboardItem,
} from "./leaderboard-row";

/**
 * Top-level leaderboard component for /app/community.
 *
 * Composition:
 *   1. LeaderboardPodium (top 3)
 *   2. Filter bar (search + niche + tier + sort)
 *   3. Ranked rows (position 4+)
 *   4. Floating compare bar (when 2-3 rows are selected)
 *
 * Filters are URL-synced so refreshes / bookmarks / shares preserve state.
 * Compare mode is selection-based: clicking a row toggles selection
 * (instead of opening) while there's at least 1 row selected. The
 * floating bar provides an "exit compare" affordance.
 */

type Sort = "rank" | "score" | "views" | "recent";

export function Leaderboard({
  podiumItems,
  rows,
  niches,
  initialFilters,
}: {
  podiumItems: PodiumItem[];
  rows: LeaderboardItem[];
  niches: string[];
  initialFilters: {
    q: string;
    niche: string | null;
    tier: string | null;
    sort: Sort;
  };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialFilters.q);
  const [niche, setNiche] = useState<string | null>(initialFilters.niche);
  const [tier, setTier] = useState<string | null>(initialFilters.tier);
  const [sort, setSort] = useState<Sort>(initialFilters.sort);
  const [selected, setSelected] = useState<string[]>([]);

  function applyFilters(
    patch: Partial<{
      q: string;
      niche: string | null;
      tier: string | null;
      sort: Sort;
    }>,
  ) {
    const next = new URLSearchParams(sp);
    const merged = { q, niche, tier, sort, ...patch };
    if (merged.q) next.set("q", merged.q);
    else next.delete("q");
    if (merged.niche) next.set("niche", merged.niche);
    else next.delete("niche");
    if (merged.tier) next.set("tier", merged.tier);
    else next.delete("tier");
    if (merged.sort !== "rank") next.set("sort", merged.sort);
    else next.delete("sort");
    router.push(`/app/community?${next.toString()}`);
  }

  function toggleSelect(slug: string) {
    setSelected((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= 3
          ? prev
          : [...prev, slug],
    );
  }

  const compareMode = selected.length > 0;
  const canCompare = selected.length >= 2;
  const compareHref = useMemo(
    () => `/app/community/compare?slugs=${selected.join(",")}`,
    [selected],
  );

  // First 3 globally-ranked items live in the podium. The rest start at
  // position 4 in the list (or 1 if there's no podium because list is small).
  const startingPosition = podiumItems.length + 1;

  return (
    <div className="space-y-8 md:space-y-10">
      {/* Podium — only when no filters are active. Filters narrow the
          dataset, so showing a global "top 3" alongside a filtered list
          would be misleading. */}
      {!q && !niche && !tier && sort === "rank" && podiumItems.length > 0 && (
        <LeaderboardPodium items={podiumItems} />
      )}

      {/* Filter bar */}
      <section>
        <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-4 md:p-5 grid grid-cols-1 md:grid-cols-[1fr_180px_180px_180px_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30 pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters({ q })}
              placeholder="Search domain or summary…"
              className="pl-10 h-10"
            />
          </div>
          <Select
            value={niche ?? "__all"}
            onValueChange={(v) =>
              applyFilters({ niche: v === "__all" ? null : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All niches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All niches</SelectItem>
              {niches.map((n) => (
                <SelectItem key={n} value={n}>
                  {n[0]?.toUpperCase() + n.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tier ?? "__all"}
            onValueChange={(v) =>
              applyFilters({ tier: v === "__all" ? null : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All tiers</SelectItem>
              {[...RANK_TIERS].reverse().map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => applyFilters({ sort: v as Sort })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rank">Leaderboard rank</SelectItem>
              <SelectItem value="score">Pure score</SelectItem>
              <SelectItem value="views">Most viewed</SelectItem>
              <SelectItem value="recent">Most recent</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => applyFilters({ q })} disabled={!q}>
            Search
          </Button>
        </div>

        {/* Active-filter chips — quick visual reminder of what's narrowing the list */}
        {(q || niche || tier) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-white/35">
              Filters:
            </span>
            {q && (
              <FilterChip
                label={`"${q}"`}
                onClear={() => {
                  setQ("");
                  applyFilters({ q: "" });
                }}
              />
            )}
            {niche && (
              <FilterChip
                label={niche}
                onClear={() => applyFilters({ niche: null })}
              />
            )}
            {tier && (
              <FilterChip
                label={`Tier: ${RANK_TIERS.find((t) => t.key === tier)?.name ?? tier}`}
                onClear={() => applyFilters({ tier: null })}
              />
            )}
          </div>
        )}
      </section>

      {/* Ranked rows */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="size-4 text-champagne-400" />
          <h2 className="text-sm font-medium uppercase tracking-widest text-white/60">
            {q || niche || tier ? "Filtered results" : "Leaderboard"}
          </h2>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-card/20 p-12 text-center">
            <p className="text-white/40">
              {q || niche || tier
                ? "No audits match these filters."
                : "No more audits below the top 3 yet — publish yours."}
            </p>
            <Link
              href="/app/analyzer"
              className="mt-4 inline-block text-sm text-champagne-400 hover:text-champagne-300 transition-colors"
            >
              Run an analysis →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((item, i) => (
              <LeaderboardRow
                key={item.id}
                item={item}
                position={startingPosition + i}
                index={i}
                selectable={compareMode}
                selected={selected.includes(item.slug)}
                onToggle={() => toggleSelect(item.slug)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Helper — when no compare mode is active, let the user start one */}
      {!compareMode && rows.length > 0 && (
        <div className="text-center">
          <button
            onClick={() => toggleSelect(rows[0].slug)}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Compare 2-3 audits side-by-side · click rows to select
          </button>
        </div>
      )}

      {/* Floating compare bar */}
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-3 rounded-2xl bg-obsidian-900/95 backdrop-blur-xl border border-white/10 px-4 py-2.5 shadow-2xl">
              <ArrowLeftRight className="size-4 text-champagne-400" />
              <span className="text-sm text-white">
                {selected.length} selected
              </span>
              <Link href={canCompare ? compareHref : "#"}>
                <Button size="sm" disabled={!canCompare}>
                  Compare side-by-side
                </Button>
              </Link>
              <button
                onClick={() => setSelected([])}
                className="text-white/40 hover:text-white p-1"
                aria-label="Clear selection"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-white/70 hover:border-white/15 hover:bg-white/[0.07] transition-all"
    >
      {label}
      <X className="size-3 text-white/40" />
    </button>
  );
}
