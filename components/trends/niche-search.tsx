"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Niche = { slug: string; name: string; description: string | null };

/**
 * Client-side niche search: filters the (already loaded) niche list as you
 * type and links each chip to /app/trends?niche=<slug>. No data fetching here —
 * the trends themselves are server-rendered from cache.
 */
export function NicheSearch({
  niches,
  selected,
}: {
  niches: Niche[];
  selected: string | null;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? niches.filter(
        (n) =>
          n.name.toLowerCase().includes(query) ||
          (n.description ?? "").toLowerCase().includes(query),
      )
    : niches;

  return (
    <div>
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your niche…"
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-champagne-400/40"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filtered.map((n) => {
          const active = selected === n.slug;
          return (
            <Link
              key={n.slug}
              href={`/app/trends?niche=${n.slug}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                active
                  ? "border-champagne-400/40 bg-champagne-400/10 text-champagne-300"
                  : "border-white/[0.08] bg-white/[0.02] text-white/65 hover:text-white hover:border-white/20",
              )}
            >
              {n.name}
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-white/40">
            No niches match &ldquo;{q}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
