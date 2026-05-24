"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Eye, ExternalLink, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCompact } from "@/lib/utils";

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

export function CommunityCard({
  item,
  index = 0,
  selected,
  selectable,
  onToggle,
}: {
  item: FeedItem;
  index?: number;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const author = item.display_name ?? "Anonymous founder";
  const fallbackShot =
    item.screenshot_url ??
    `https://s.wordpress.com/mshots/v1/${encodeURIComponent(item.url)}?w=800&h=560`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.04, 0.4),
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card/40 transition-all",
        selected
          ? "border-champagne-400/40 shadow-gold"
          : "border-white/[0.06] hover:border-white/[0.14]",
      )}
    >
      {/* Compare checkbox */}
      <button
        onClick={(e) => {
          e.preventDefault();
          if (selectable) onToggle();
        }}
        className={cn(
          "absolute top-3 right-3 z-10 size-7 rounded-md flex items-center justify-center transition-all",
          selected
            ? "bg-champagne-400 text-obsidian-900"
            : selectable
              ? "bg-obsidian-900/80 backdrop-blur text-white/40 hover:text-white hover:bg-obsidian-900"
              : "bg-obsidian-900/40 text-white/20 cursor-not-allowed",
        )}
        aria-label="Add to compare"
      >
        {selected ? (
          <Check className="size-4" />
        ) : (
          <span className="text-xs">＋</span>
        )}
      </button>

      <Link href={`/app/community/${item.slug}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-obsidian-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fallbackShot}
            alt={item.domain}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950/85 via-obsidian-950/20 to-transparent" />

          {/* Score chip */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <div className="rounded-lg bg-obsidian-900/85 backdrop-blur ring-1 ring-white/10 px-3 py-1.5">
              <p className="text-[10px] uppercase tracking-widest text-white/40 leading-none">
                Score
              </p>
              <p className="font-serif text-2xl tnum text-gold-gradient leading-none mt-0.5">
                {item.score}
              </p>
            </div>
            {item.is_featured && <Badge variant="gold">Featured</Badge>}
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium text-white truncate">
                {item.domain}
              </h3>
              <p className="text-xs text-white/40">
                by {author}
                {item.niche && (
                  <span className="ml-1.5 text-white/30">
                    · {item.niche}
                  </span>
                )}
              </p>
            </div>
            <ExternalLink className="size-3.5 text-white/30 shrink-0" />
          </div>

          <p className="text-sm text-white/65 leading-relaxed line-clamp-3">
            {item.summary}
          </p>

          <div className="flex items-center gap-4 text-[11px] text-white/40 pt-1">
            <span className="flex items-center gap-1">
              <Eye className="size-3" />
              {formatCompact(item.view_count)}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="size-3" />
              {formatCompact(item.helpful_count)}
            </span>
            <span className="ml-auto">
              {new Date(item.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
