"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Sparkline — a tiny hand-rolled SVG trend line, following the viewBox /
 * scaling convention of components/analyzer/simulator-chart.tsx (no chart
 * library). Colour comes from `currentColor`, so callers set the token via a
 * text-* class (default `text-signal-400` = teal data) — no hardcoded hex.
 *
 * The line draws itself in on mount; honors `prefers-reduced-motion` (renders
 * fully drawn, no animation). Auto-scales to the series' own min/max so the
 * SHAPE of the momentum reads even for small score swings.
 */
export function Sparkline({
  data,
  width = 76,
  height = 24,
  area = true,
  className,
  ariaLabel,
}: {
  data: number[];
  width?: number;
  height?: number;
  area?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const reduced = useReducedMotion();
  const gradId = useId();

  // Need at least two points to draw a line.
  if (!data || data.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("text-signal-400", className)}
        style={{ width, height }}
        role="img"
        aria-label={ariaLabel ?? "Not enough history yet"}
      >
        <line
          x1={2}
          x2={width - 2}
          y1={height / 2}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const PAD = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const xFor = (i: number) =>
    PAD + ((width - PAD * 2) * i) / (data.length - 1);
  // Invert Y (SVG origin top-left); pad vertically so peaks aren't clipped.
  const yFor = (v: number) =>
    height - PAD - ((height - PAD * 2) * (v - min)) / span;

  const pts = data.map((v, i) => `${xFor(i).toFixed(2)},${yFor(v).toFixed(2)}`);
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `M ${xFor(0).toFixed(2)},${height - PAD} L ${pts.join(
    " L ",
  )} L ${xFor(data.length - 1).toFixed(2)},${height - PAD} Z`;

  const lastX = xFor(data.length - 1);
  const lastY = yFor(data[data.length - 1]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("text-signal-400", className)}
      style={{ width, height }}
      role="img"
      aria-label={ariaLabel ?? `Score trend, latest ${data[data.length - 1]}`}
    >
      {area && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        </>
      )}
      <motion.path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Endpoint dot marks the latest value. */}
      <circle cx={lastX} cy={lastY} r="1.8" fill="currentColor" />
    </svg>
  );
}
