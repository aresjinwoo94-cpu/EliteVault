"use client";

import { RANKS, type RankKey } from "@/lib/growth-map/ranks";

/**
 * The Growth Map canvas (spec v2). Pure SVG, visual-only — interaction (the
 * per-node popovers, spec §7) lives in an HTML overlay in growth-map.tsx, which
 * positions itself from the exported NODE_POS. Ported from the self-contained
 * web-artifacts-builder prototype.
 *
 * Geometry (spec §4): the route ASCENDS from Copper (bottom-left) to Ruby
 * (top-right) with gentle amplitude and STRAIGHT segments. The ONLY descent is
 * The Wall — a small dip between Steel and Silver. Icons (spec §5) are flat,
 * monocolour vectors tinted to each rank's material. Typography (spec §6) uses
 * the theme tokens via Tailwind font utilities (font-display / font-mono / body).
 */

export const VIEWBOX = { w: 900, h: 320 };

// Node centres — ascending, one dip at Silver (The Wall). Kept in sync with the
// overlay via NODE_POS (percent positions derived below).
const XY: { x: number; y: number }[] = [
  { x: 80, y: 238 }, // Copper  (bottom-left)
  { x: 232, y: 196 }, // Steel   (up)
  { x: 384, y: 210 }, // Silver  (dip = The Wall)
  { x: 536, y: 162 }, // Gold    (up)
  { x: 688, y: 120 }, // Diamond (up)
  { x: 832, y: 82 }, // Ruby    (top-right)
];

/** Node positions as viewBox coords + percentages (for the HTML overlay). */
export const NODE_POS = XY.map((p) => ({
  ...p,
  xPct: (p.x / VIEWBOX.w) * 100,
  yPct: (p.y / VIEWBOX.h) * 100,
}));

/** Flat, monocolour vector icon per rank (spec §5). Drawn around (0,0). */
function RankIcon({ rankKey, color }: { rankKey: RankKey; color: string }) {
  switch (rankKey) {
    case "copper": // coin ($)
      return (
        <g>
          <circle r={8.5} fill="none" stroke={color} strokeWidth={1.5} />
          <text
            y={3.4}
            textAnchor="middle"
            className="font-mono"
            fontSize={11}
            fontWeight={700}
            fill={color}
          >
            $
          </text>
        </g>
      );
    case "steel": // hammer (NOT a clock)
      return (
        <g fill={color}>
          <rect x={-8} y={-8.5} width={16} height={5} rx={2} />
          <rect x={-2} y={-4.5} width={4} height={12.5} rx={1.6} />
        </g>
      );
    case "silver": // breastplate / armor
      return (
        <g>
          <path
            d="M-4,-8 L0,-5 L4,-8 M0,-6 C-6,-6 -7.5,-3 -7.5,0 C-7.5,4 -4,7.5 0,8.5 C4,7.5 7.5,4 7.5,0 C7.5,-3 6,-6 0,-6 Z"
            fill={color}
            fillOpacity={0.18}
            stroke={color}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <line x1={0} y1={-4} x2={0} y2={7} stroke={color} strokeWidth={0.9} strokeOpacity={0.8} />
        </g>
      );
    case "gold": // stacked ingots (bars, NOT a box)
      return (
        <g fill={color} fillOpacity={0.9}>
          <path d="M-3.5,-6 L3.5,-6 L4.5,-2.5 L-4.5,-2.5 Z" />
          <path d="M-8.5,-1 L-1,-1 L0,2.5 L-9.5,2.5 Z" />
          <path d="M1,-1 L8.5,-1 L9.5,2.5 L0,2.5 Z" />
        </g>
      );
    case "diamond": // brilliant-cut diamond
      return (
        <g>
          <polygon
            points="0,-8.5 7.5,-2.5 0,9 -7.5,-2.5"
            fill={color}
            fillOpacity={0.22}
            stroke={color}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <g stroke={color} strokeWidth={0.8} strokeOpacity={0.8}>
            <line x1={-7.5} y1={-2.5} x2={7.5} y2={-2.5} />
            <line x1={-3.7} y1={-2.5} x2={0} y2={9} />
            <line x1={3.7} y1={-2.5} x2={0} y2={9} />
          </g>
        </g>
      );
    case "ruby": // red gem
      return (
        <g>
          <polygon
            points="-4,-6.5 4,-6.5 8,0 4,7.5 -4,7.5 -8,0"
            fill={color}
            fillOpacity={0.22}
            stroke={color}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <g stroke={color} strokeWidth={0.8} strokeOpacity={0.8}>
            <line x1={-4} y1={-6.5} x2={4} y2={-6.5} />
            <line x1={-8} y1={0} x2={8} y2={0} />
            <line x1={-4} y1={-6.5} x2={-8} y2={0} />
            <line x1={4} y1={-6.5} x2={8} y2={0} />
          </g>
        </g>
      );
  }
}

export function MapCanvas({
  currentIndex,
  openIndex,
}: {
  currentIndex: number;
  /** Rank whose pin is open (null = nothing open — the default). */
  openIndex: number | null;
}) {
  const pathPoints = XY.map((p) => `${p.x},${p.y}`).join(" ");
  const lockedPoints = XY.slice(currentIndex)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Growth rank map, Copper to Ruby"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="gm-brand" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="0.5" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="gm-path" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.85" />
          <stop offset="0.28" stopColor="#2DD4BF" stopOpacity="0.5" />
          <stop offset="0.42" stopColor="#9AA6B4" stopOpacity="0.28" />
          <stop offset="1" stopColor="#9AA6B4" stopOpacity="0.14" />
        </linearGradient>
        <radialGradient id="gm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.5" />
          <stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Route — ascending, solid base */}
      <polyline
        points={pathPoints}
        fill="none"
        stroke="url(#gm-path)"
        strokeWidth={3.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {currentIndex < XY.length - 1 && (
        <polyline
          points={lockedPoints}
          fill="none"
          stroke="#CBD5E1"
          strokeOpacity={0.22}
          strokeWidth={1.8}
          strokeDasharray="2 7"
          strokeLinecap="round"
        />
      )}

      {/* ── The Wall — danger zone, below the dip, clear of the nodes (spec §9) ── */}
      <g>
        <path d="M308,214 L282,250" stroke="#EF4444" strokeOpacity={0.5} strokeWidth={1.8} strokeDasharray="4 5" fill="none" />
        <path d="M308,214 L336,254" stroke="#EF4444" strokeOpacity={0.5} strokeWidth={1.8} strokeDasharray="4 5" fill="none" />
        <g stroke="#EF4444" strokeWidth={1.8} strokeOpacity={0.85}>
          <line x1={277} y1={245} x2={287} y2={255} />
          <line x1={287} y1={245} x2={277} y2={255} />
          <line x1={331} y1={249} x2={341} y2={259} />
          <line x1={341} y1={249} x2={331} y2={259} />
        </g>
        <text x={270} y={270} textAnchor="middle" className="font-mono" fontSize={7} fill="#EF4444" letterSpacing="0.06em">
          NO EXIT
        </text>
        <text x={345} y={273} textAnchor="middle" className="font-mono" fontSize={7} fill="#EF4444" letterSpacing="0.06em">
          FALL BACK
        </text>
        <g transform="translate(308,286)">
          <path d="M0,-13 L12,8 L-12,8 Z" fill="rgba(239,68,68,0.12)" stroke="#EF4444" strokeOpacity={0.7} strokeWidth={1.3} />
          <line x1={0} y1={-5} x2={0} y2={2} stroke="#EF4444" strokeWidth={1.5} />
          <circle cx={0} cy={5} r={1} fill="#EF4444" />
        </g>
        <text x={308} y={308} textAnchor="middle" className="font-display" fontSize={10} fontWeight={600} fill="#F6C9C9">
          THE WALL · most stores quit here
        </text>
        <text x={308} y={319} textAnchor="middle" className="font-mono" fontSize={8} fill="#EF4444" letterSpacing="0.04em">
          87% stall here · HBR &rsquo;08
        </text>
      </g>

      {/* ── Nodes ── */}
      {RANKS.map((rank, i) => {
        const pos = XY[i];
        const state = i < currentIndex ? "past" : i === currentIndex ? "current" : "ahead";
        const open = i === openIndex;
        return (
          <g key={rank.key} transform={`translate(${pos.x},${pos.y})`}>
            {state === "current" && <circle r={34} fill="url(#gm-glow)" />}
            {open && (
              <circle r={27} fill="none" stroke="#2DD4BF" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 4" />
            )}
            <circle
              r={22}
              fill="none"
              stroke={state === "current" ? "url(#gm-brand)" : rank.color}
              strokeOpacity={state === "ahead" ? 0.32 : state === "past" ? 0.5 : 1}
              strokeWidth={state === "current" ? 2.4 : 1.5}
              strokeDasharray={state === "ahead" ? "3 4" : undefined}
            />
            <circle
              r={18}
              fill={rank.color}
              fillOpacity={state === "ahead" ? 0.05 : state === "past" ? 0.13 : 0.18}
              stroke={rank.color}
              strokeOpacity={state === "ahead" ? 0.4 : 0.9}
              strokeWidth={1}
            />
            {/* icons enlarged per owner feedback (2 rounds) */}
            <g opacity={state === "ahead" ? 0.65 : 1} transform="scale(1.28)">
              <RankIcon rankKey={rank.key} color={rank.color} />
            </g>

            <text y={-31} textAnchor="middle" className="font-mono" fontSize={8.5} fill={rank.color} letterSpacing="0.1em" opacity={state === "ahead" ? 0.75 : 1}>
              {rank.material.toUpperCase()}
            </text>
            <text y={34} textAnchor="middle" className="font-sans" fontSize={9} fill={state === "ahead" ? "#C7CAD1" : "#fff"} fontWeight={state === "current" ? 700 : 600}>
              {rank.stage}
            </text>
            <text y={45} textAnchor="middle" className="font-mono" fontSize={7} fill="#8A8F98">
              {rank.band}
            </text>

            {state === "past" && (
              <g transform="translate(14,-14)">
                <circle r={6} fill="#22C55E" />
                <path d="M-2.6,0 l1.9,2 L3.4,-2.6" stroke="#06060A" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}

            {state === "current" && (
              <g transform="translate(0,-52)">
                <rect x={-34} y={-10} width={68} height={20} rx={10} fill="#0A0A0F" stroke="url(#gm-brand)" strokeWidth={1.4} />
                <text y={3.5} textAnchor="middle" className="font-sans" fontSize={8.5} fontWeight={700} fill="#5EEAD4" letterSpacing="0.07em">
                  YOUR STORE
                </text>
              </g>
            )}

            {state === "ahead" && (
              <g transform="translate(15,-15)" opacity={0.8}>
                <circle r={6.5} fill="#0A0A0F" stroke={rank.color} strokeOpacity={0.6} />
                <rect x={-2} y={-1} width={4} height={3.5} rx={0.8} fill={rank.color} fillOpacity={0.8} />
                <path d="M-1.3,-1 v-1.4 a1.3,1.3 0 0 1 2.6,0 v1.4" fill="none" stroke={rank.color} strokeWidth={0.8} strokeOpacity={0.8} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
