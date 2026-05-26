"use client";

import {
  Sprout,
  Flag,
  Hammer,
  Cog,
  TrendingUp,
  Castle,
  Diamond,
  Mountain,
  Crown,
  Gem,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { tierByKey, type RankTier } from "@/lib/ranking/tiers";

/**
 * Tier badge — shows the tier name + icon with the tier's color treatment.
 * Used in leaderboard rows, podium cards, and the user's own audit page.
 *
 * Two sizes:
 *   • "sm" — for inline use in lists, dense rows (24px height)
 *   • "lg" — for podium hero cards (36px height + tagline)
 *
 * The icon lookup is local (not dynamic from lucide-react) so the bundle
 * stays tree-shake-friendly and there's no runtime "icon not found" risk.
 */

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Sprout,
  Flag,
  Hammer,
  Cog,
  TrendingUp,
  Castle,
  Diamond,
  Mountain,
  Crown,
  Gem,
};

export function RankBadge({
  tierKey,
  size = "sm",
  showTagline = false,
  className,
}: {
  /** The DB-stored tier key — pass community_analyses.rank_tier directly */
  tierKey: string | null | undefined;
  size?: "sm" | "lg";
  showTagline?: boolean;
  className?: string;
}) {
  const tier = tierByKey(tierKey);
  const Icon = ICONS[tier.iconName] ?? Sprout;

  if (size === "lg") {
    return (
      <div
        className={cn(
          "inline-flex flex-col items-start gap-1 rounded-xl ring-1 px-3 py-2",
          tier.bgClass,
          tier.ringClass,
          tier.isElite && "shadow-[0_0_24px_-6px_currentColor]",
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("size-4", tier.textClass)} />
          <span className={cn("text-sm font-medium", tier.textClass)}>
            {tier.name}
          </span>
        </div>
        {showTagline && (
          <span className="text-[11px] text-white/45 leading-tight">
            {tier.tagline}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md ring-1 px-2 py-0.5",
        tier.bgClass,
        tier.ringClass,
        className,
      )}
    >
      <Icon className={cn("size-3", tier.textClass)} />
      <span
        className={cn(
          "text-[11px] font-medium uppercase tracking-wider",
          tier.textClass,
        )}
      >
        {tier.name}
      </span>
    </div>
  );
}

/** Re-export for parent components that want the full tier object. */
export type { RankTier };
