import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * MetricChip — the ONE coherent treatment for a labelled KPI: CTR / ROI /
 * CONV / TRAFFIC and any other metric. A muted mono label over a mono
 * tabular value, with an optional colored delta (▲ success / ▼ destructive).
 *
 * Value is a ReactNode so callers pass already-formatted strings
 * (e.g. "2.5%", "3.8x", "420K") — formatting stays at the call site.
 */
export function MetricChip({
  label,
  value,
  delta,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Optional signed change; renders ▲/▼ colored by sign. */
  delta?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-center",
        className,
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
        {label}
      </p>
      <p className="mt-0.5 flex items-baseline justify-center gap-1 text-xs font-medium text-white">
        <span className="num">{value}</span>
        {delta != null && (
          <span
            className={cn(
              "num text-[0.85em]",
              delta >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {delta >= 0 ? "▲" : "▼"}
            {Math.abs(delta)}
          </span>
        )}
      </p>
    </div>
  );
}
