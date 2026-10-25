/**
 * Hand-drawn SVG diagrams for the landing's "The toolkit" cards (one per tool).
 * They draw the MECHANISM of each tool — not a mock of a screen: pins on a
 * page, a store among its niche winners, three 7-day curves vs break-even.
 *
 * Pure SVG + CSS (no JS, no framer): the entrance animation is a few CSS
 * keyframes toggled by the parent card's `data-in` attribute, and it is
 * disabled under prefers-reduced-motion (everything simply shows). Colors come
 * from the `signal` palette via currentColor/Tailwind, 1px hairlines.
 *
 * Text inside the SVGs is deliberately minimal (≥ 11px at the card's width).
 */

const KEYFRAMES = `
@keyframes tk-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
@keyframes tk-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes tk-draw { to { stroke-dashoffset: 0; } }
.tk-pin, .tk-fade { opacity: 0; transform-box: fill-box; transform-origin: center; }
.tk-draw { stroke-dasharray: var(--len, 400); stroke-dashoffset: var(--len, 400); }
[data-in="true"] .tk-pin { animation: tk-pop .45s cubic-bezier(.22,1,.36,1) forwards; animation-delay: var(--d, 0s); }
[data-in="true"] .tk-fade { animation: tk-fade .6s ease-out forwards; animation-delay: var(--d, 0s); }
[data-in="true"] .tk-draw { animation: tk-draw 1.1s ease-out forwards; animation-delay: var(--d, 0s); }
@media (prefers-reduced-motion: reduce) {
  .tk-pin, .tk-fade { opacity: 1; animation: none !important; transform: none; }
  .tk-draw { stroke-dashoffset: 0; animation: none !important; }
}
`;

/** Shared <style>, rendered once by the parent section. */
export function ToolkitDiagramStyles() {
  return <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />;
}

const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)" } as const;

/** 1 — Analyzer: a store page, numbered pins on it, a line out to "$ potential". */
export function AnalyzerDiagram({ potentialLabel }: { potentialLabel: string }) {
  const pins = [
    { n: 1, x: 96, y: 62, d: 0.15 },
    { n: 2, x: 168, y: 104, d: 0.3 },
    { n: 3, x: 88, y: 150, d: 0.45 },
    { n: 4, x: 176, y: 176, d: 0.6 },
  ];
  return (
    <svg viewBox="0 0 400 240" role="img" aria-hidden className="h-full w-full" fill="none">
      {/* schematic store page */}
      <g className="stroke-white/20" strokeWidth="1">
        <rect x="40" y="24" width="190" height="192" rx="10" />
        <line x1="40" y1="44" x2="230" y2="44" />
      </g>
      <g className="fill-white/20">
        <circle cx="52" cy="34" r="2.5" />
        <circle cx="62" cy="34" r="2.5" />
        <circle cx="72" cy="34" r="2.5" />
      </g>
      <g className="stroke-white/15" strokeWidth="1">
        <rect x="56" y="56" width="158" height="44" rx="6" />
        <line x1="66" y1="70" x2="140" y2="70" />
        <line x1="66" y1="82" x2="118" y2="82" />
        <rect x="56" y="112" width="48" height="48" rx="6" />
        <rect x="112" y="112" width="48" height="48" rx="6" />
        <rect x="168" y="112" width="46" height="48" rx="6" />
        <rect x="56" y="168" width="158" height="32" rx="6" />
      </g>
      {/* line from the pins to the result */}
      <path
        d="M176 176 C 250 176, 262 120, 300 120"
        className="tk-draw stroke-signal-400/70"
        strokeWidth="1"
        style={{ ["--len" as string]: 160, ["--d" as string]: "0.8s" }}
      />
      {/* pins */}
      {pins.map((p) => (
        <g key={p.n} className="tk-pin" style={{ ["--d" as string]: `${p.d}s` }}>
          <circle cx={p.x} cy={p.y} r="10" className="fill-obsidian-900 stroke-signal-400" strokeWidth="1" />
          <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-signal-300" style={{ ...mono, fontSize: 15 }}>
            {p.n}
          </text>
        </g>
      ))}
      {/* result */}
      <g className="tk-fade" style={{ ["--d" as string]: "1.2s" }}>
        <rect x="300" y="96" width="76" height="48" rx="10" className="fill-signal-600/10 stroke-signal-400/70" strokeWidth="1" />
        <text x="338" y="116" textAnchor="middle" className="fill-signal-300" style={{ ...mono, fontSize: 15, letterSpacing: "0.08em" }}>
          $
        </text>
        <text x="338" y="134" textAnchor="middle" className="fill-white/70" style={{ ...mono, fontSize: 15 }}>
          {potentialLabel}
        </text>
      </g>
    </svg>
  );
}

/** 2 — Library: your store in the middle, niche winners around it, one marked top. */
export function LibraryDiagram({ youLabel, topLabel }: { youLabel: string; topLabel: string }) {
  const stores = [
    { x: 40, y: 34, d: 0.15 },
    { x: 262, y: 34, d: 0.3, top: true },
    { x: 40, y: 156, d: 0.45 },
    { x: 262, y: 156, d: 0.6 },
  ];
  const cx = 200;
  const cy = 120;
  return (
    <svg viewBox="0 0 400 240" role="img" aria-hidden className="h-full w-full" fill="none">
      {/* links */}
      <g strokeWidth="1">
        {stores.map((s, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={s.x + 49}
            y2={s.y + 28}
            className={`tk-fade ${s.top ? "stroke-signal-400/70" : "stroke-white/20"}`}
            style={{ ["--d" as string]: `${s.d}s` }}
          />
        ))}
      </g>
      {/* niche winners */}
      {stores.map((s, i) => (
        <g key={i} className="tk-fade" style={{ ["--d" as string]: `${s.d}s` }}>
          <rect
            x={s.x}
            y={s.y}
            width="98"
            height="56"
            rx="8"
            className={s.top ? "fill-signal-600/10 stroke-signal-400" : "fill-obsidian-900 stroke-white/20"}
            strokeWidth="1"
          />
          <line x1={s.x + 10} y1={s.y + 14} x2={s.x + 58} y2={s.y + 14} className="stroke-white/20" />
          <rect x={s.x + 10} y={s.y + 24} width="34" height="22" rx="4" className="stroke-white/15" />
          <rect x={s.x + 50} y={s.y + 24} width="38" height="22" rx="4" className="stroke-white/15" />
          {s.top && (
            <g>
              <rect x={s.x - 26} y={s.y - 27} width="150" height="23" rx="11.5" className="fill-signal-600/15 stroke-signal-400/60" />
              <text x={s.x + 49} y={s.y - 11} textAnchor="middle" className="fill-signal-300" style={{ ...mono, fontSize: 15 }}>
                {topLabel}
              </text>
            </g>
          )}
        </g>
      ))}
      {/* your store */}
      <g className="tk-pin" style={{ ["--d" as string]: "0s" }}>
        <rect x={cx - 52} y={cy - 30} width="104" height="60" rx="10" className="fill-obsidian-900 stroke-signal-400" strokeWidth="1" />
        <line x1={cx - 40} y1={cy - 14} x2={cx + 10} y2={cy - 14} className="stroke-signal-400/50" />
        <rect x={cx - 40} y={cy - 4} width="36" height="24" rx="4" className="stroke-signal-400/40" />
        <rect x={cx + 2} y={cy - 4} width="38" height="24" rx="4" className="stroke-signal-400/40" />
        <text x={cx} y={cy + 46} textAnchor="middle" className="fill-white/70" style={{ ...mono, fontSize: 15 }}>
          {youLabel}
        </text>
      </g>
    </svg>
  );
}

/** 3 — Simulator: 7-day chart, three scenario curves, a break-even marker. */
export function SimulatorDiagram({ breakEvenLabel, daysLabel }: { breakEvenLabel: string; daysLabel: string }) {
  // x: day 1..7 across 60..360, y: lower is higher value.
  const xs = [60, 110, 160, 210, 260, 310, 360];
  const mk = (ys: number[]) => xs.map((x, i) => `${i ? "L" : "M"}${x} ${ys[i]}`).join(" ");
  const aggressive = mk([184, 168, 138, 110, 92, 80, 72]);
  const balanced = mk([188, 176, 154, 134, 120, 112, 106]);
  const conservative = mk([192, 184, 168, 156, 148, 144, 140]);
  const breakEvenY = 120;
  return (
    <svg viewBox="0 0 400 240" role="img" aria-hidden className="h-full w-full" fill="none">
      {/* axes + grid */}
      <g className="stroke-white/10" strokeWidth="1">
        <line x1="50" y1="40" x2="50" y2="200" />
        <line x1="50" y1="200" x2="372" y2="200" />
        <line x1="50" y1="160" x2="372" y2="160" />
        <line x1="50" y1="80" x2="372" y2="80" />
      </g>
      {xs.map((x, i) => (
        <text key={i} x={x} y="218" textAnchor="middle" className="fill-white/35" style={{ ...mono, fontSize: 15 }}>
          {`D${i + 1}`}
        </text>
      ))}
      {/* break-even */}
      <g className="tk-fade" style={{ ["--d" as string]: "0.1s" }}>
        <line x1="50" y1={breakEvenY} x2="372" y2={breakEvenY} className="stroke-white/45" strokeDasharray="4 4" />
        <text x="56" y={breakEvenY - 7} className="fill-white/60" style={{ ...mono, fontSize: 15 }}>
          {breakEvenLabel}
        </text>
      </g>
      {/* the three scenarios */}
      <path d={conservative} className="tk-draw stroke-white/45" strokeWidth="1.5" style={{ ["--len" as string]: 330, ["--d" as string]: "0.2s" }} />
      <path d={balanced} className="tk-draw stroke-signal-300" strokeWidth="1.5" style={{ ["--len" as string]: 330, ["--d" as string]: "0.4s" }} />
      <path d={aggressive} className="tk-draw stroke-signal-500" strokeWidth="1.5" style={{ ["--len" as string]: 330, ["--d" as string]: "0.6s" }} />
      {/* crossing marker on the balanced curve */}
      <g className="tk-pin" style={{ ["--d" as string]: "1.3s" }}>
        <circle cx="260" cy={breakEvenY} r="5" className="fill-obsidian-900 stroke-signal-300" strokeWidth="1" />
      </g>
      <text x="56" y="34" className="fill-white/40" style={{ ...mono, fontSize: 15, letterSpacing: "0.08em" }}>
        {daysLabel}
      </text>
    </svg>
  );
}
