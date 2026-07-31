"use client";

import Link from "next/link";
import { Sparkles, ArrowRight, Lock } from "lucide-react";
import type { NodeFeedback } from "@/lib/growth-map/types";
import { rankByKey } from "@/lib/growth-map/ranks";

/**
 * Horizontal content for the detail band below the map (spec §7, v3). Revealed
 * when a rank is hovered/focused — it never floats over the map or header.
 *
 * Open ranks (current + past) show the real store-specific feedback. Locked
 * ranks show a plan-agnostic ad (the buyer upgrades for the Analyzer TOOLS, not
 * one rank's copy), not tied to the rank.
 */
export function NodeCard({ node }: { node: NodeFeedback }) {
  const rank = rankByKey(node.rankKey);

  if (node.locked) {
    return (
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signal-500/12 ring-1 ring-signal-400/30">
          <Lock className="size-4 text-signal-300" />
        </span>
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-white/80">
          Use <span className="text-white">Pro or Scale</span> to unlock the tools
          and keep scaling.
        </p>
        <Link
          href="/app/checkout?plan=pro&interval=month"
          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-signal-400 px-3 py-1.5 text-[11.5px] font-semibold text-[#06060a]"
        >
          <Sparkles className="size-3.5" />
          Unlock
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  const roleLabel = node.role === "current" ? "YOUR STORE" : "Cleared";
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{
          color: rank.color,
          background: `${rank.color}1f`,
          boxShadow: `inset 0 0 0 1px ${rank.color}55`,
        }}
        aria-hidden
      >
        {rank.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.09em]"
            style={{ color: rank.color }}
          >
            {rank.material}
          </span>
          <span className="text-white/40">·</span>
          <span className="text-[11px] text-white/80">{rank.stage}</span>
          <span
            className={`ml-1 shrink-0 rounded-full px-2 py-[1px] text-[9px] font-semibold ${
              node.role === "current"
                ? "bg-[#22C55E] text-[#06060a]"
                : "border border-white/10 text-white/55"
            }`}
          >
            {roleLabel}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/80">
          {node.text}
        </p>
      </div>
    </div>
  );
}
