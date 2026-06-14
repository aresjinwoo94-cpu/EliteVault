"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, Heart, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RankBadge } from "./rank-badge";

export interface LeaderboardItem {
  id: string;
  slug: string;
  domain: string;
  display_name: string | null;
  niche: string | null;
  url: string;
  composite_score: number;
  rank_tier: string | null;
  view_count: number;
  helpful_count: number;
  screenshot_url: string | null;
  summary: string | null;
  is_featured: boolean;
}

/**
 * One row in the leaderboard below the podium. Compact, scannable, but
 * still gives the user enough info to decide whether to click in:
 *   • Rank position (big serif number)
 *   • Small thumbnail (visual recognition)
 *   • Brand name + domain
 *   • Niche pill
 *   • Composite score
 *   • Tier badge
 *   • View/helpful counts on hover
 *
 * Selectable for compare mode — when `selectable` is true, the row gets
 * a checkbox in the rank-number slot, and clicking the row toggles
 * selection instead of navigating.
 */
export function LeaderboardRow({
  item,
  position,
  index,
  selectable,
  selected,
  onToggle,
}: {
  item: LeaderboardItem;
  /** 1-indexed position in the overall leaderboard */
  position: number;
  /** Order in the rendered list (for stagger animation) */
  index: number;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const rowContent = (
    <>
      {/* Rank or checkbox */}
      <div className="shrink-0 w-12 md:w-14 text-center relative">
        {selectable && selected ? (
          <div className="size-7 mx-auto rounded-full bg-champagne-400 text-obsidian-900 flex items-center justify-center">
            <Check className="size-4" />
          </div>
        ) : (
          <span className="font-serif text-2xl md:text-3xl text-gold-gradient tnum leading-none">
            #{position}
          </span>
        )}
      </div>

      {/* Thumbnail */}
      <div className="shrink-0 hidden sm:block">
        <div className="size-14 rounded-lg overflow-hidden bg-obsidian-800 border border-white/[0.04]">
          {item.screenshot_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.screenshot_url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-obsidian-700 to-obsidian-900" />
          )}
        </div>
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {item.display_name ?? item.domain}
          </p>
          {item.is_featured && (
            <Badge variant="gold" className="shrink-0 hidden sm:inline-flex">
              Featured
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-white/40 truncate">{item.domain}</p>
          {item.niche && (
            <>
              <span className="text-white/15">·</span>
              <span className="text-xs text-white/50 capitalize">
                {item.niche}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Composite score */}
      <div className="shrink-0 text-right hidden sm:block">
        <p className="text-[10px] uppercase tracking-widest text-white/35">
          Composite
        </p>
        <p className="num text-xl text-signal-300 leading-tight">
          {item.composite_score.toFixed(1)}
        </p>
      </div>

      {/* Tier badge */}
      <div className="shrink-0">
        <RankBadge tierKey={item.rank_tier} size="sm" />
      </div>

      {/* View counts (desktop only) */}
      <div className="shrink-0 hidden lg:flex items-center gap-3 text-[11px] text-white/40 w-20">
        <span className="inline-flex items-center gap-1">
          <Eye className="size-3" />
          <span className="num">{item.view_count}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart className="size-3" />
          <span className="num">{item.helpful_count}</span>
        </span>
      </div>
    </>
  );

  const baseClass = cn(
    "flex items-center gap-3 md:gap-4 rounded-xl border px-3 py-3 md:px-4 transition-all",
    selected
      ? "border-champagne-400/40 bg-champagne-400/[0.04] shadow-[0_0_24px_-12px_rgba(245,198,116,0.5)]"
      : "border-white/[0.06] bg-card/30 hover:border-white/[0.14] hover:bg-card/60",
  );

  if (selectable) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.02, 0.4), duration: 0.3 }}
        type="button"
        onClick={onToggle}
        className={cn(baseClass, "w-full text-left")}
      >
        {rowContent}
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.4), duration: 0.3 }}
    >
      <Link href={`/app/community/${item.slug}`} className={baseClass}>
        {rowContent}
      </Link>
    </motion.div>
  );
}
