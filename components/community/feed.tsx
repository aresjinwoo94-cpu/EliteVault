"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, ArrowLeftRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommunityCard } from "./community-card";

interface FeedItem {
  id: string;
  slug: string;
  display_name: string | null;
  url: string;
  domain: string;
  score: number;
  niche: string | null;
  summary: string;
  view_count: number;
  helpful_count: number;
  screenshot_url: string | null;
  created_at: string;
  is_featured: boolean;
}

type Sort = "recent" | "score" | "views";

export function CommunityFeed({
  initialItems,
  niches,
  initialFilters,
}: {
  initialItems: FeedItem[];
  niches: string[];
  initialFilters: { niche: string | null; sort: Sort; q: string };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialFilters.q);
  const [niche, setNiche] = useState<string | null>(initialFilters.niche);
  const [sort, setSort] = useState<Sort>(initialFilters.sort);
  const [selected, setSelected] = useState<string[]>([]);

  function applyFilters(patch: Partial<{ q: string; niche: string | null; sort: Sort }>) {
    const next = new URLSearchParams(sp);
    const merged = { q, niche, sort, ...patch };
    if (merged.q) next.set("q", merged.q);
    else next.delete("q");
    if (merged.niche) next.set("niche", merged.niche);
    else next.delete("niche");
    if (merged.sort !== "recent") next.set("sort", merged.sort);
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

  const canCompare = selected.length >= 2;

  const compareHref = useMemo(
    () => `/app/community/compare?slugs=${selected.join(",")}`,
    [selected],
  );

  return (
    <>
      {/* Filter bar */}
      <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-4 md:p-5 grid md:grid-cols-[1fr_180px_180px_auto] gap-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters({ q })}
            placeholder="Search by domain or what's wrong with it…"
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
        <Select value={sort} onValueChange={(v) => applyFilters({ sort: v as Sort })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="score">Highest score</SelectItem>
            <SelectItem value="views">Most viewed</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => applyFilters({ q })} disabled={!q}>
          Search
        </Button>
      </div>

      {/* Grid */}
      <motion.div
        layout
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {initialItems.length === 0 ? (
          <div className="col-span-full text-center py-16 text-white/40">
            No published audits yet. Be the first.
          </div>
        ) : (
          initialItems.map((item, i) => (
            <CommunityCard
              key={item.id}
              item={item}
              index={i}
              selected={selected.includes(item.slug)}
              selectable={selected.length < 3 || selected.includes(item.slug)}
              onToggle={() => toggleSelect(item.slug)}
            />
          ))
        )}
      </motion.div>

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
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
