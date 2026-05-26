"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Crown, Medal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RankBadge } from "./rank-badge";
import { cn } from "@/lib/utils";

export interface PodiumItem {
  id: string;
  slug: string;
  domain: string;
  display_name: string | null;
  niche: string | null;
  composite_score: number;
  rank_tier: string | null;
  screenshot_url: string | null;
  url: string;
}

/**
 * Top-3 podium block at the top of the community leaderboard.
 *
 * Layout: classic Olympic podium — 2nd left (silver, mid height), 1st
 * center (gold, tallest, with crown), 3rd right (bronze, shortest). On
 * mobile this stacks vertically with #1 on top.
 *
 * #1 gets a crown + animated gold halo. All three get rank numbers
 * displayed prominently in serif font, the tier badge, the composite
 * score, and a small thumbnail. Clicking opens the full audit.
 *
 * The empty state (< 3 items) renders gracefully — missing positions
 * show a "claim this spot" prompt that links to the analyzer.
 */
export function LeaderboardPodium({ items }: { items: PodiumItem[] }) {
  // Pad to 3 so we can always render a podium layout
  const padded: (PodiumItem | null)[] = [
    items[0] ?? null,
    items[1] ?? null,
    items[2] ?? null,
  ];
  // Reorder for desktop podium visual: 2nd, 1st, 3rd
  const desktopOrder = [padded[1], padded[0], padded[2]];

  return (
    <section className="relative">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">
            Hall of Fame
          </p>
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight mt-1">
            The current top three.
          </h2>
        </div>
        <Badge variant="gold" className="hidden sm:inline-flex">
          <Crown className="size-3" />
          All-time
        </Badge>
      </div>

      {/* Mobile: stack vertically with #1 on top */}
      <div className="grid grid-cols-1 md:hidden gap-3">
        {padded.map((item, i) =>
          item ? <PodiumCard key={item.id} item={item} place={i + 1} /> : (
            <EmptySlot key={`empty-${i}`} place={i + 1} />
          ),
        )}
      </div>

      {/* Desktop: 2/1/3 podium */}
      <div className="hidden md:grid md:grid-cols-3 gap-4 items-end">
        {desktopOrder.map((item, idx) => {
          // Map back to actual place number
          const place = idx === 0 ? 2 : idx === 1 ? 1 : 3;
          // 1st place taller, 2nd mid, 3rd shorter
          const heightClass = place === 1 ? "md:min-h-[340px]" : place === 2 ? "md:min-h-[280px] md:mt-12" : "md:min-h-[260px] md:mt-16";
          return (
            <div key={`slot-${place}`} className={cn("relative", heightClass)}>
              {item ? (
                <PodiumCard item={item} place={place} />
              ) : (
                <EmptySlot place={place} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PodiumCard({ item, place }: { item: PodiumItem; place: number }) {
  const isFirst = place === 1;
  const isSecond = place === 2;
  const placeColor = isFirst
    ? "text-gold-gradient"
    : isSecond
      ? "text-slate-200"
      : "text-amber-700";
  const placeRingColor = isFirst
    ? "ring-champagne-400/40"
    : isSecond
      ? "ring-slate-300/30"
      : "ring-amber-700/30";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
        delay: 0.08 * (3 - place),
      }}
      className="h-full"
    >
      <Link href={`/app/community/${item.slug}`} className="group block h-full">
        <Card
          className={cn(
            "relative overflow-hidden h-full p-5 transition-all",
            "hover:border-white/15",
            isFirst &&
              "ring-2 ring-champagne-400/30 shadow-[0_0_40px_-12px_rgba(245,198,116,0.4)]",
          )}
        >
          {/* Ambient glow for #1 */}
          {isFirst && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 size-60 rounded-full bg-champagne-400/20 blur-3xl animate-pulse" />
            </div>
          )}

          {/* Crown for #1 */}
          {isFirst && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="absolute -top-3 left-1/2 -translate-x-1/2"
            >
              <div className="bg-gradient-to-br from-champagne-300 to-champagne-600 size-10 rounded-full flex items-center justify-center shadow-[0_4px_20px_-4px_rgba(245,198,116,0.8)]">
                <Crown className="size-5 text-obsidian-900" />
              </div>
            </motion.div>
          )}

          {/* Medal for #2, #3 */}
          {!isFirst && (
            <div className="absolute top-3 right-3">
              <Medal className={cn("size-4", placeColor)} />
            </div>
          )}

          <div className="relative h-full flex flex-col">
            {/* Place number — massive serif */}
            <div
              className={cn(
                "inline-flex items-baseline gap-1 ring-1 rounded-lg px-2.5 py-1 self-start",
                placeRingColor,
              )}
            >
              <span className="text-[10px] uppercase tracking-widest text-white/40">
                Rank
              </span>
              <span
                className={cn(
                  "font-serif text-2xl tnum leading-none",
                  placeColor,
                )}
              >
                #{place}
              </span>
            </div>

            {/* Thumbnail */}
            <div className="mt-4 rounded-lg overflow-hidden aspect-[16/10] bg-obsidian-800 border border-white/[0.04]">
              {item.screenshot_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.screenshot_url}
                  alt={`${item.domain} thumbnail`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-obsidian-700 to-obsidian-900 flex items-center justify-center">
                  <span className="text-[10px] text-white/30 uppercase tracking-widest">
                    No preview
                  </span>
                </div>
              )}
            </div>

            {/* Name + niche */}
            <div className="mt-3 min-w-0">
              <p className="font-medium text-white truncate">
                {item.display_name ?? item.domain}
              </p>
              <p className="text-xs text-white/45 truncate">{item.domain}</p>
            </div>

            {/* Composite score + tier badge */}
            <div className="mt-auto pt-4 flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40">
                  Composite
                </p>
                <p
                  className={cn(
                    "font-serif text-3xl tnum leading-none mt-0.5",
                    isFirst ? "text-gold-gradient" : "text-white",
                  )}
                >
                  {item.composite_score.toFixed(1)}
                </p>
              </div>
              <RankBadge tierKey={item.rank_tier} size="sm" />
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

function EmptySlot({ place }: { place: number }) {
  return (
    <Link href="/app/analyzer" className="group block h-full">
      <Card className="h-full p-5 border-dashed border-white/[0.08] bg-transparent flex flex-col items-center justify-center text-center min-h-[200px] hover:border-white/[0.15] transition-colors">
        <span className="font-serif text-4xl text-white/15 tnum">#{place}</span>
        <p className="mt-2 text-xs text-white/35 group-hover:text-white/55 transition-colors">
          Claim this spot
        </p>
        <p className="mt-1 text-[10px] text-white/25">Run an audit →</p>
      </Card>
    </Link>
  );
}
