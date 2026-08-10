"use client";

import { RANKS, type RankKey } from "@/lib/growth-map/ranks";

/**
 * The Growth Map canvas (v3). Pure SVG, visual-only — interaction (the per-node
 * detail, spec §7) lives in growth-map.tsx, positioned from NODE_POS.
 *
 * v3 changes (owner feedback):
 *  - Flatter / more horizontal: a wide, short viewBox with gentle amplitude.
 *  - Premium material icons with gradients + highlights, shaped after the
 *    reference set: coin, gear, 4-point sparkle, gold bars, diamond, pear ruby.
 *  - The Wall is a brick-wall obstacle sitting ON the route with a legible label.
 *
 * Geometry (spec §4): the route ASCENDS Copper→Ruby with straight segments; the
 * only descent is the small dip at The Wall (between Steel and Silver).
 */

export const VIEWBOX = { w: 1120, h: 210 };

// Node centres — ascending, one dip at Silver (The Wall). Flat amplitude.
const XY: { x: number; y: number }[] = [
  { x: 66, y: 150 }, // Copper  (bottom-left)
  { x: 270, y: 126 }, // Steel
  { x: 470, y: 140 }, // Silver  (dip = The Wall)
  { x: 664, y: 112 }, // Gold
  { x: 858, y: 90 }, // Diamond
  { x: 1054, y: 68 }, // Ruby    (top-right)
];

export const NODE_POS = XY.map((p) => ({
  ...p,
  xPct: (p.x / VIEWBOX.w) * 100,
  yPct: (p.y / VIEWBOX.h) * 100,
}));

const R_OUT = 20; // medallion outer ring
const R_DISC = 16; // material disc

/** Gear silhouette (Steel) — alternating outer/inner radius points. */
function gearPath(teeth: number, rOut: number, rIn: number): string {
  const steps = teeth * 2;
  const pts: string[] = [];
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 === 0 ? rOut : rIn;
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** 4-point sparkle (Silver). */
function star4(rOut: number, rIn: number): string {
  return `M0,${-rOut} L${rIn},${-rIn} L${rOut},0 L${rIn},${rIn} L0,${rOut} L${-rIn},${rIn} L${-rOut},0 L${-rIn},${-rIn} Z`;
}

/** Reusable material gradients — id-prefixed so the same set can live in the
 *  map SVG and in a standalone glyph without id collisions. */
export function GradientDefs({ prefix }: { prefix: string }) {
  return (
    <>
      <linearGradient id={`${prefix}copper`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor="#E8A96B" />
        <stop offset="1" stopColor="#9C5A2A" />
      </linearGradient>
      <linearGradient id={`${prefix}steel`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor="#EDF1F5" />
        <stop offset="1" stopColor="#8A96A4" />
      </linearGradient>
      <linearGradient id={`${prefix}silver`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="1" stopColor="#9AA6B4" />
      </linearGradient>
      <linearGradient id={`${prefix}gold`} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stopColor="#F9DE86" />
        <stop offset="1" stopColor="#C9922E" />
      </linearGradient>
      <linearGradient id={`${prefix}diamond`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor="#EAFCFF" />
        <stop offset="1" stopColor="#7FD3E8" />
      </linearGradient>
      <linearGradient id={`${prefix}ruby`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor="#FF6B85" />
        <stop offset="1" stopColor="#A81834" />
      </linearGradient>
    </>
  );
}

/** Premium material icon, drawn around (0,0). Gradient fill + highlight. */
function RankIcon({ rankKey, idPrefix }: { rankKey: RankKey; idPrefix: string }) {
  const g = (id: string) => `url(#${idPrefix}${id})`;
  switch (rankKey) {
    case "copper": // polished coin
      return (
        <g>
          <circle r={11} fill={g("copper")} stroke="#7C4A22" strokeWidth={1} />
          <circle r={8} fill="none" stroke="#F0B884" strokeOpacity={0.45} strokeWidth={1} />
          <path d="M-6.5,-5.5 A9 9 0 0 1 3,-7.5" fill="none" stroke="#FFE0C0" strokeOpacity={0.65} strokeWidth={1.6} strokeLinecap="round" />
        </g>
      );
    case "steel": // gear / cog
      return (
        <g>
          <path d={gearPath(8, 11, 8.2)} fill={g("steel")} stroke="#6B7684" strokeWidth={0.8} strokeLinejoin="round" />
          <circle r={3.6} fill="#0E0E16" stroke="#6B7684" strokeWidth={0.8} />
          <path d="M-5,-6 A8 8 0 0 1 3,-7.5" fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={1.4} strokeLinecap="round" />
        </g>
      );
    case "silver": // 4-point sparkle
      return (
        <g>
          <path d={star4(11.5, 3)} fill={g("silver")} stroke="#8A96A4" strokeWidth={0.7} strokeLinejoin="round" />
          <path d="M6,-9 l1.4,2.6 l2.6,1.4 l-2.6,1.4 l-1.4,2.6 l-1.4,-2.6 l-2.6,-1.4 l2.6,-1.4 Z" fill={g("silver")} stroke="#8A96A4" strokeWidth={0.5} />
          <circle cx={-1.5} cy={-1.5} r={1.6} fill="#FFFFFF" fillOpacity={0.7} />
        </g>
      );
    case "gold": // stacked bars
      return (
        <g stroke="#A9761F" strokeWidth={0.6} strokeLinejoin="round">
          <path d="M-4,-7 L4,-7 L5.4,-3 L-5.4,-3 Z" fill={g("gold")} />
          <path d="M-10,-1.5 L-1.2,-1.5 L0.2,3 L-11.4,3 Z" fill={g("gold")} />
          <path d="M1.2,-1.5 L10,-1.5 L11.4,3 L-0.2,3 Z" fill={g("gold")} />
          <line x1={-3} y1={-6} x2={3} y2={-6} stroke="#FFF0C0" strokeOpacity={0.7} strokeWidth={0.9} />
        </g>
      );
    case "diamond": // brilliant cut
      return (
        <g stroke="#5FB8D6" strokeWidth={0.7} strokeLinejoin="round">
          <path d="M-8,-4 L-4,-9 L4,-9 L8,-4 L0,11 Z" fill={g("diamond")} />
          <g stroke="#BFF0FB" strokeOpacity={0.75} strokeWidth={0.6}>
            <line x1={-8} y1={-4} x2={8} y2={-4} />
            <line x1={-4} y1={-9} x2={-2.5} y2={-4} />
            <line x1={4} y1={-9} x2={2.5} y2={-4} />
            <line x1={-2.5} y1={-4} x2={0} y2={11} />
            <line x1={2.5} y1={-4} x2={0} y2={11} />
          </g>
          <path d="M-3.2,-7.5 L2.6,-7.5" stroke="#FFFFFF" strokeOpacity={0.8} strokeWidth={1} strokeLinecap="round" />
        </g>
      );
    case "ruby": // pear / teardrop cut
      return (
        <g stroke="#8E1330" strokeWidth={0.7} strokeLinejoin="round">
          <path d="M0,-11 C5.5,-9 9,-3 9,2.5 C9,8 5,11 0,11 C-5,11 -9,8 -9,2.5 C-9,-3 -5.5,-9 0,-11 Z" fill={g("ruby")} />
          <g stroke="#FF9DB0" strokeOpacity={0.6} strokeWidth={0.55}>
            <line x1={0} y1={-11} x2={0} y2={11} />
            <line x1={-9} y1={2.5} x2={9} y2={2.5} />
            <line x1={0} y1={-11} x2={-9} y2={2.5} />
            <line x1={0} y1={-11} x2={9} y2={2.5} />
          </g>
          <path d="M-3,-7 C-1,-8 1,-8 2.5,-6.5" fill="none" stroke="#FFD0DA" strokeOpacity={0.75} strokeWidth={1.1} strokeLinecap="round" />
        </g>
      );
  }
}

/** Standalone material glyph for use OUTSIDE the map (e.g. the detail band).
 *  Self-contained SVG with its own gradient defs (unique id prefix). */
export function RankGlyph({
  rankKey,
  size = 22,
}: {
  rankKey: RankKey;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-14 -14 28 28"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="block"
    >
      <defs>
        <GradientDefs prefix="gg-grad-" />
      </defs>
      <RankIcon rankKey={rankKey} idPrefix="gg-grad-" />
    </svg>
  );
}

export function MapCanvas({
  currentIndex,
  openIndex,
  ghostIndex = null,
}: {
  currentIndex: number;
  openIndex: number | null;
  /** brief §1.1 — projected "potential" rank; draws a ghost medallion. */
  ghostIndex?: number | null;
}) {
  const pathPoints = XY.map((p) => `${p.x},${p.y}`).join(" ");
  const lockedPoints = XY.slice(currentIndex)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  const a = XY[1];
  const b = XY[2];
  const wallX = (a.x + b.x) / 2; // 370
  const wallY = (a.y + b.y) / 2 + 3; // sits on the dip

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
          <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.9" />
          <stop offset="0.32" stopColor="#2DD4BF" stopOpacity="0.5" />
          <stop offset="0.42" stopColor="#9AA6B4" stopOpacity="0.3" />
          <stop offset="1" stopColor="#9AA6B4" stopOpacity="0.16" />
        </linearGradient>
        <radialGradient id="gm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
        </radialGradient>
        {/* Material gradients (top-light → bottom-dark) */}
        <GradientDefs prefix="gm-grad-" />
        <filter id="gm-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.6" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Route */}
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

      {/* ── The Wall — brick-wall obstacle ON the route + label (spec §9) ── */}
      <g>
        {/* dead-end branches */}
        <path d={`M${wallX},${wallY + 8} L${wallX - 40},${wallY + 44}`} stroke="#EF4444" strokeOpacity={0.5} strokeWidth={1.6} strokeDasharray="4 5" fill="none" />
        <path d={`M${wallX},${wallY + 8} L${wallX + 40},${wallY + 46}`} stroke="#EF4444" strokeOpacity={0.5} strokeWidth={1.6} strokeDasharray="4 5" fill="none" />
        <g stroke="#EF4444" strokeWidth={1.6} strokeOpacity={0.85}>
          <line x1={wallX - 45} y1={wallY + 39} x2={wallX - 35} y2={wallY + 49} />
          <line x1={wallX - 35} y1={wallY + 39} x2={wallX - 45} y2={wallY + 49} />
          <line x1={wallX + 35} y1={wallY + 41} x2={wallX + 45} y2={wallY + 51} />
          <line x1={wallX + 45} y1={wallY + 41} x2={wallX + 35} y2={wallY + 51} />
        </g>

        {/* brick wall icon, sitting on the path */}
        <g transform={`translate(${wallX},${wallY})`} filter="url(#gm-shadow)">
          <rect x={-13} y={-9} width={26} height={18} rx={2} fill="#1a1013" stroke="#EF4444" strokeOpacity={0.7} strokeWidth={1.1} />
          <g stroke="#EF4444" strokeOpacity={0.55} strokeWidth={0.8}>
            <line x1={-13} y1={-3} x2={13} y2={-3} />
            <line x1={-13} y1={3} x2={13} y2={3} />
            <line x1={-4} y1={-9} x2={-4} y2={-3} />
            <line x1={5} y1={-9} x2={5} y2={-3} />
            <line x1={0} y1={-3} x2={0} y2={3} />
            <line x1={-8.5} y1={-3} x2={-8.5} y2={3} />
            <line x1={8.5} y1={-3} x2={8.5} y2={3} />
            <line x1={-4} y1={3} x2={-4} y2={9} />
            <line x1={5} y1={3} x2={5} y2={9} />
          </g>
        </g>

        {/* pointer + label */}
        <text x={wallX} y={wallY + 74} textAnchor="middle" className="font-display" fontSize={9.5} fontWeight={600} fill="#F6C9C9">
          THE WALL · most stores quit here
        </text>
        <text x={wallX} y={wallY + 85} textAnchor="middle" className="font-mono" fontSize={7.5} fill="#EF4444" letterSpacing="0.03em">
          87% stall here · HBR &rsquo;08
        </text>
      </g>

      {/* ── Potential (ghost) node — brief §1.1: "here's where these fixes take
          you." Deterministic projection, drawn as a dashed brand-ring halo on
          the projected rank with a POTENTIAL tag and a dashed lift arrow from
          the current node. ── */}
      {ghostIndex != null &&
        ghostIndex !== currentIndex &&
        ghostIndex >= 0 &&
        ghostIndex < XY.length &&
        (() => {
          const from = XY[currentIndex];
          const to = XY[ghostIndex];
          return (
            <g>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="url(#gm-brand)"
                strokeWidth={1.8}
                strokeOpacity={0.7}
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
              <g transform={`translate(${to.x},${to.y})`}>
                <circle
                  r={R_OUT + 3}
                  fill="url(#gm-glow)"
                  opacity={0.6}
                />
                <circle
                  r={R_OUT + 3}
                  fill="none"
                  stroke="url(#gm-brand)"
                  strokeWidth={1.8}
                  strokeDasharray="3 3"
                  strokeOpacity={0.9}
                />
                <g transform="translate(0,-46)">
                  <rect
                    x={-31}
                    y={-9.5}
                    width={62}
                    height={19}
                    rx={9.5}
                    fill="#0A0A0F"
                    stroke="url(#gm-brand)"
                    strokeWidth={1.2}
                    strokeDasharray="3 3"
                  />
                  <text
                    y={3.5}
                    textAnchor="middle"
                    className="font-sans"
                    fontSize={8}
                    fontWeight={700}
                    fill="#5EEAD4"
                    letterSpacing="0.06em"
                  >
                    POTENTIAL
                  </text>
                </g>
              </g>
            </g>
          );
        })()}

      {/* ── Nodes ── */}
      {RANKS.map((rank, i) => {
        const pos = XY[i];
        const state = i < currentIndex ? "past" : i === currentIndex ? "current" : "ahead";
        const open = i === openIndex;
        return (
          <g key={rank.key} transform={`translate(${pos.x},${pos.y})`}>
            {state === "current" && <circle r={R_OUT + 12} fill="url(#gm-glow)" />}
            {open && (
              <circle r={R_OUT + 6} fill="none" stroke="#2DD4BF" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 4" />
            )}
            <g filter="url(#gm-shadow)">
              <circle
                r={R_OUT}
                fill="#0E0E16"
                stroke={state === "current" ? "url(#gm-brand)" : rank.color}
                strokeOpacity={state === "ahead" ? 0.4 : state === "past" ? 0.6 : 1}
                strokeWidth={state === "current" ? 2.4 : 1.4}
                strokeDasharray={state === "ahead" ? "3 4" : undefined}
              />
              <circle r={R_DISC} fill={rank.color} fillOpacity={state === "ahead" ? 0.05 : 0.12} />
            </g>
            <g opacity={state === "ahead" ? 0.72 : 1}>
              <RankIcon rankKey={rank.key} idPrefix="gm-grad-" />
            </g>

            <text y={-28} textAnchor="middle" className="font-mono" fontSize={8.5} fill={rank.color} letterSpacing="0.1em" opacity={state === "ahead" ? 0.8 : 1}>
              {rank.material.toUpperCase()}
            </text>
            <text y={31} textAnchor="middle" className="font-sans" fontSize={9} fill={state === "ahead" ? "#C7CAD1" : "#fff"} fontWeight={state === "current" ? 700 : 600}>
              {rank.stage}
            </text>
            <text y={41} textAnchor="middle" className="font-mono" fontSize={7} fill="#8A8F98">
              {rank.band}
            </text>
            {/* (The "$ is potential, not your revenue" note used to live here at
                a near-illegible 5.5px — it's redundant with the prominent banner
                directly below the map, so the per-node line was removed.) */}

            {state === "past" && (
              <g transform="translate(13,-13)" filter="url(#gm-shadow)">
                <circle r={5.5} fill="#22C55E" />
                <path d="M-2.4,0 l1.7,1.9 L3,-2.4" stroke="#06060A" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            {state === "current" && (
              <g transform="translate(0,-46)">
                <rect x={-33} y={-9.5} width={66} height={19} rx={9.5} fill="#0A0A0F" stroke="url(#gm-brand)" strokeWidth={1.4} />
                <text y={3.5} textAnchor="middle" className="font-sans" fontSize={8} fontWeight={700} fill="#5EEAD4" letterSpacing="0.06em">
                  YOUR STORE
                </text>
              </g>
            )}
            {state === "ahead" && (
              <g transform="translate(14,-14)" opacity={0.85}>
                <circle r={6} fill="#0A0A0F" stroke={rank.color} strokeOpacity={0.6} />
                <rect x={-1.9} y={-0.9} width={3.8} height={3.3} rx={0.7} fill={rank.color} fillOpacity={0.85} />
                <path d="M-1.25,-0.9 v-1.3 a1.25,1.25 0 0 1 2.5,0 v1.3" fill="none" stroke={rank.color} strokeWidth={0.8} strokeOpacity={0.85} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
