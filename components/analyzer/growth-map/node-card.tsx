"use client";

import type { NodeFeedback } from "@/lib/growth-map/types";
import { rankByKey } from "@/lib/growth-map/ranks";

/**
 * Popover body for an OPEN rank node (spec §7) — the "pin" content, like the
 * numbered pins on the annotated screenshot. Only current + past ranks (real,
 * free feedback) use this. Locked ranks don't open a rank-anchored popover at
 * all — they raise a small, plan-agnostic upgrade ALERT instead (see
 * UpgradeAlert in growth-map.tsx), so nothing covers the route or ties the
 * pitch to a single rank.
 */
export function NodeCard({ node }: { node: NodeFeedback }) {
  const rank = rankByKey(node.rankKey);
  const roleLabel = node.role === "current" ? "YOUR STORE" : "Cleared";

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.09em]"
          style={{ color: rank.color }}
        >
          {rank.material}
        </span>
        <span className="text-white/40">·</span>
        <span className="text-white/80">{rank.stage}</span>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-[2px] text-[9.5px] font-semibold ${
            node.role === "current"
              ? "bg-[#22C55E] text-[#06060a]"
              : "border border-white/10 text-white/55"
          }`}
        >
          {roleLabel}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-white/80">
        {node.text}
      </p>
    </div>
  );
}
