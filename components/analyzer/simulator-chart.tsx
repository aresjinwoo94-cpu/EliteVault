"use client";

import { useMemo } from "react";
import type { SimulationDay } from "@/lib/supabase/types";

/**
 * Hand-rolled SVG chart for the 7-day spend vs revenue projection.
 *
 * Why hand-rolled instead of recharts:
 *   • We already render >40 components on the analyzer page — adding a chart
 *     library (~25KB) for one 7-day chart isn't worth it.
 *   • Full control over the gold/teal brand gradients.
 *   • Zero hydration cost.
 *
 * Renders 2 lines (spend + revenue) on a single y-axis, with day labels
 * and a subtle grid. The revenue line gets a faint area fill so the
 * "profitable / not profitable" gap is visually obvious.
 */
export function SimulatorChart({ days }: { days: SimulationDay[] }) {
  // SVG viewBox: 0..600 wide, 0..200 tall, with 30px padding for labels.
  const W = 600;
  const H = 200;
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 24;

  const { spendPath, revPath, revArea, gridLines, dayLabels, yLabels, maxY } =
    useMemo(() => {
      const xs = days.map((_, i) => i);
      const maxSpend = Math.max(...days.map((d) => d.spend), 1);
      const maxRev = Math.max(...days.map((d) => d.revenue), 1);
      const max = Math.ceil(Math.max(maxSpend, maxRev) * 1.15);

      const xFor = (i: number) =>
        PAD_L + ((W - PAD_L - PAD_R) * i) / Math.max(xs.length - 1, 1);
      const yFor = (v: number) =>
        H - PAD_B - ((H - PAD_T - PAD_B) * v) / max;

      const spendPts = days.map((d, i) => `${xFor(i)},${yFor(d.spend)}`);
      const revPts = days.map((d, i) => `${xFor(i)},${yFor(d.revenue)}`);

      const spendPath = `M ${spendPts.join(" L ")}`;
      const revPath = `M ${revPts.join(" L ")}`;
      // Closed polygon for revenue area
      const revArea = `M ${xFor(0)},${H - PAD_B} L ${revPts.join(" L ")} L ${xFor(days.length - 1)},${H - PAD_B} Z`;

      // 4 horizontal grid lines
      const gridLines = [0.25, 0.5, 0.75, 1].map((p) => ({
        y: H - PAD_B - (H - PAD_T - PAD_B) * p,
        label: Math.round(max * p),
      }));

      const dayLabels = days.map((d, i) => ({
        x: xFor(i),
        label: `D${d.day}`,
      }));

      const yLabels = gridLines.map((g) => ({
        y: g.y,
        label: `$${g.label.toLocaleString()}`,
      }));

      return {
        spendPath,
        revPath,
        revArea,
        gridLines,
        dayLabels,
        yLabels,
        maxY: max,
      };
    }, [days]);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`7-day spend vs revenue, max approx $${maxY}`}
      >
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(245 198 116)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(245 198 116)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid */}
        {gridLines.map((g, i) => (
          <line
            key={i}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={g.y}
            y2={g.y}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}

        {/* y-axis labels */}
        {yLabels.map((l, i) => (
          <text
            key={i}
            x={PAD_L - 6}
            y={l.y + 3}
            textAnchor="end"
            className="fill-white/40"
            style={{ fontSize: 9, fontFamily: "ui-sans-serif" }}
          >
            {l.label}
          </text>
        ))}

        {/* revenue area */}
        <path d={revArea} fill="url(#revFill)" />

        {/* revenue line (gold) */}
        <path
          d={revPath}
          fill="none"
          stroke="rgb(245 198 116)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* spend line (teal, dashed) */}
        <path
          d={spendPath}
          fill="none"
          stroke="rgb(45 212 191)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* dots on revenue line */}
        {days.map((d, i) => {
          const xFor = (j: number) =>
            PAD_L + ((W - PAD_L - PAD_R) * j) / Math.max(days.length - 1, 1);
          const yFor = (v: number) =>
            H - PAD_B - ((H - PAD_T - PAD_B) * v) / maxY;
          return (
            <circle
              key={i}
              cx={xFor(i)}
              cy={yFor(d.revenue)}
              r="2.5"
              fill="rgb(245 198 116)"
            />
          );
        })}

        {/* x-axis labels */}
        {dayLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={H - 6}
            textAnchor="middle"
            className="fill-white/40"
            style={{ fontSize: 10, fontFamily: "ui-sans-serif" }}
          >
            {l.label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-4 text-[11px] text-white/55">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4 bg-champagne-400" />
          Revenue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-[1.5px] w-4"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgb(45 212 191) 50%, transparent 50%)",
              backgroundSize: "6px 1.5px",
            }}
          />
          Spend
        </span>
      </div>
    </div>
  );
}
