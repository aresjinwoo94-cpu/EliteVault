"use client";

import { motion } from "framer-motion";
import { Zap, Target } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Fix {
  title: string;
  impact: "high" | "medium" | "low";
  effort: "S" | "M" | "L";
}

/**
 * Impact / Effort 2x2 matrix — the consulting-deck classic.
 *
 *   Impact ↑
 *   ┌──────────────┬──────────────┐
 *   │  Major bets  │  QUICK WINS  │   ← top-right = highest leverage
 *   │  (slow but   │  (ship now)  │
 *   │   worth it)  │              │
 *   ├──────────────┼──────────────┤
 *   │   Backlog    │  Fill-ins    │
 *   │ (skip these) │ (filler)     │
 *   └──────────────┴──────────────┘
 *                                  → Effort
 *
 * Each top_fix lands in the right quadrant based on its impact + effort
 * tier. The Quick Wins quadrant is highlighted gold so the operator's
 * eye goes straight to "ship these 3 things this week".
 */
export function ImpactEffortMatrix({ fixes }: { fixes: Fix[] }) {
  // 2D grid: x = effort (S/M/L → 0/1/2), y = impact (low/med/high → 0/1/2)
  // We flip Y for SVG (top = high impact)
  const W = 480;
  const H = 320;
  const PAD = 36;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const effortX: Record<Fix["effort"], number> = { S: 0.17, M: 0.5, L: 0.83 };
  const impactY: Record<Fix["impact"], number> = {
    high: 0.18,
    medium: 0.5,
    low: 0.82,
  };

  // Distribute fixes — if multiple land on same spot, jitter slightly so labels don't stack.
  const placed = fixes.slice(0, 8).map((f, i) => {
    const xRatio = effortX[f.effort];
    const yRatio = impactY[f.impact];
    // Stable jitter per index (so animation order is consistent)
    const jx = ((i * 73) % 5) * 0.018 - 0.045;
    const jy = ((i * 41) % 5) * 0.018 - 0.045;
    return {
      ...f,
      x: PAD + (xRatio + jx) * innerW,
      y: PAD + (yRatio + jy) * innerH,
      isQuickWin: f.impact === "high" && f.effort === "S",
    };
  });

  const quickWinCount = placed.filter((p) => p.isQuickWin).length;

  return (
    <Card className="p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-champagne-400/10 blur-3xl" />

      <div className="relative">
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-champagne-400" />
            <h3 className="text-sm font-medium">Impact / Effort matrix</h3>
          </div>
          {quickWinCount > 0 && (
            <span className="text-[10px] uppercase tracking-widest text-champagne-300">
              {quickWinCount} quick {quickWinCount === 1 ? "win" : "wins"}
            </span>
          )}
        </div>
        <p className="text-xs text-white/45 mb-4">
          Top-right = ship this week. Bottom-left = ignore until later.
        </p>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label="Impact effort matrix of top fixes"
        >
          <defs>
            <linearGradient id="quickWinGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgb(245 198 116)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="rgb(245 198 116)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Quick-wins quadrant highlight (top-right) */}
          <rect
            x={PAD + innerW / 2}
            y={PAD}
            width={innerW / 2}
            height={innerH / 2}
            fill="url(#quickWinGrad)"
            stroke="rgba(245, 198, 116, 0.18)"
            strokeWidth="0.5"
            rx="6"
          />

          {/* Outer frame */}
          <rect
            x={PAD}
            y={PAD}
            width={innerW}
            height={innerH}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
            rx="6"
          />

          {/* Center crosshair (subtle) */}
          <line
            x1={PAD + innerW / 2}
            y1={PAD}
            x2={PAD + innerW / 2}
            y2={PAD + innerH}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="2 3"
          />
          <line
            x1={PAD}
            y1={PAD + innerH / 2}
            x2={PAD + innerW}
            y2={PAD + innerH / 2}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="2 3"
          />

          {/* Quadrant labels */}
          <text
            x={PAD + innerW * 0.25}
            y={PAD + 14}
            textAnchor="middle"
            className="fill-white/30"
            style={{ fontSize: 9, fontFamily: "ui-sans-serif", letterSpacing: 1 }}
          >
            MAJOR BETS
          </text>
          <text
            x={PAD + innerW * 0.75}
            y={PAD + 14}
            textAnchor="middle"
            className="fill-champagne-300"
            style={{ fontSize: 9, fontFamily: "ui-sans-serif", letterSpacing: 1, fontWeight: 600 }}
          >
            QUICK WINS
          </text>
          <text
            x={PAD + innerW * 0.25}
            y={PAD + innerH - 6}
            textAnchor="middle"
            className="fill-white/20"
            style={{ fontSize: 9, fontFamily: "ui-sans-serif", letterSpacing: 1 }}
          >
            BACKLOG
          </text>
          <text
            x={PAD + innerW * 0.75}
            y={PAD + innerH - 6}
            textAnchor="middle"
            className="fill-white/25"
            style={{ fontSize: 9, fontFamily: "ui-sans-serif", letterSpacing: 1 }}
          >
            FILL-INS
          </text>

          {/* Axis labels */}
          <text
            x={PAD - 8}
            y={PAD + 4}
            textAnchor="end"
            className="fill-white/40"
            style={{ fontSize: 10, fontFamily: "ui-sans-serif" }}
          >
            High impact
          </text>
          <text
            x={PAD - 8}
            y={PAD + innerH}
            textAnchor="end"
            className="fill-white/40"
            style={{ fontSize: 10, fontFamily: "ui-sans-serif" }}
          >
            Low impact
          </text>
          <text
            x={PAD}
            y={H - 8}
            textAnchor="start"
            className="fill-white/40"
            style={{ fontSize: 10, fontFamily: "ui-sans-serif" }}
          >
            &lt;1h
          </text>
          <text
            x={PAD + innerW}
            y={H - 8}
            textAnchor="end"
            className="fill-white/40"
            style={{ fontSize: 10, fontFamily: "ui-sans-serif" }}
          >
            &gt;4h
          </text>

          {/* Fix dots */}
          {placed.map((p, i) => (
            <motion.g
              key={i}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.06, duration: 0.4 }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={p.isQuickWin ? 8 : 6}
                fill={p.isQuickWin ? "rgb(245 198 116)" : "rgba(255,255,255,0.55)"}
                stroke={p.isQuickWin ? "rgb(245 198 116)" : "rgba(255,255,255,0.7)"}
                strokeWidth="1.5"
                fillOpacity={p.isQuickWin ? 0.9 : 0.7}
              />
              <text
                x={p.x}
                y={p.y + 1}
                textAnchor="middle"
                className={p.isQuickWin ? "fill-obsidian-900" : "fill-obsidian-900"}
                style={{ fontSize: 9, fontFamily: "ui-sans-serif", fontWeight: 700 }}
              >
                {i + 1}
              </text>
            </motion.g>
          ))}
        </svg>

        {/* Legend with fix titles */}
        <ol className="mt-3 space-y-1.5">
          {placed.map((p, i) => (
            <li
              key={i}
              className={`flex items-center gap-2 text-xs ${
                p.isQuickWin ? "text-white" : "text-white/65"
              }`}
            >
              <span
                className={`shrink-0 size-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  p.isQuickWin
                    ? "bg-champagne-400 text-obsidian-900"
                    : "bg-white/15 text-white"
                }`}
              >
                {i + 1}
              </span>
              <span className="leading-tight flex-1 min-w-0 truncate">
                {p.title}
              </span>
              {p.isQuickWin && (
                <Zap className="size-3 text-champagne-300 shrink-0" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
