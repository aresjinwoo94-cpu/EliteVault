/**
 * Cover art + shared CSS for the landing's "The toolkit" product covers.
 *
 * Each tool is presented as a premium "product box" (a cover with a spine, in
 * the spirit of course covers) in EliteVault's own language: obsidian, a single
 * teal signal color, hairlines, soft depth. The art on each cover draws the
 * MECHANISM of the tool — pins on a page, a store among its niche winners,
 * three 7-day scenarios against break-even — as hand-built SVG (no images, no
 * logos, nothing generated).
 *
 * Pure SVG + CSS: the entrance animation is a few CSS keyframes armed by the
 * card's `data-in` attribute, and everything is static under
 * prefers-reduced-motion. Text inside the art is minimal and ≥ 12px at the
 * card's rendered width.
 */

const CSS = `
/* ---- entrance animation of the art ---- */
@keyframes tk-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
@keyframes tk-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes tk-draw { to { stroke-dashoffset: 0; } }
@keyframes tk-sweep { from { transform: translateX(-30%); opacity: 0; } 30% { opacity: .9; } to { transform: translateX(130%); opacity: 0; } }
.tk-pin, .tk-fade { opacity: 0; transform-box: fill-box; transform-origin: center; }
.tk-draw { stroke-dasharray: var(--len, 400); stroke-dashoffset: var(--len, 400); }
.tk-sweep { opacity: 0; }
[data-in="true"] .tk-pin { animation: tk-pop .5s cubic-bezier(.22,1,.36,1) forwards; animation-delay: var(--d, 0s); }
[data-in="true"] .tk-fade { animation: tk-fade .7s ease-out forwards; animation-delay: var(--d, 0s); }
[data-in="true"] .tk-draw { animation: tk-draw 1.2s ease-out forwards; animation-delay: var(--d, 0s); }
[data-in="true"] .tk-sweep { animation: tk-sweep 2.2s ease-in-out .3s 1 forwards; }

/* ---- the product box ---- */
.tk-stage { perspective: 1400px; padding-left: 28px; }
.tk-box { position: relative; transform-style: preserve-3d; transform: rotateY(23deg) rotateX(1.5deg); transition: transform .7s cubic-bezier(.22,1,.36,1); }
.tk-card:hover .tk-box, .tk-card:focus-visible .tk-box { transform: rotateY(9deg) rotateX(0deg) translateY(-6px); }
.tk-spine {
  position: absolute; top: 0; left: -28px; width: 28px; height: 100%;
  transform-origin: right center; transform: rotateY(-90deg);
  background: linear-gradient(180deg, #0f766e 0%, #115e59 38%, #0b3b38 100%);
  border-radius: 10px 0 0 10px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.28), inset 2px 0 6px rgba(0,0,0,.35);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.tk-spine span { writing-mode: vertical-rl; transform: rotate(180deg); font-family: var(--font-mono, ui-monospace, monospace); font-size: 9px; letter-spacing: .32em; color: rgba(255,255,255,.72); white-space: nowrap; text-transform: uppercase; }
.tk-front {
  position: relative; overflow: hidden; border-radius: 6px 16px 16px 6px;
  border: 1px solid transparent;
  background:
    radial-gradient(120% 70% at 85% 0%, rgba(45,212,191,.22), transparent 55%),
    radial-gradient(90% 60% at 0% 100%, rgba(13,148,136,.16), transparent 60%),
    linear-gradient(165deg, #0f1a1c 0%, #0a0f12 55%, #07090c 100%) padding-box,
    linear-gradient(140deg, rgba(94,234,212,.7), rgba(255,255,255,.07) 38%, rgba(45,212,191,.28) 100%) border-box;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.14),
    0 1px 0 rgba(255,255,255,.04),
    0 38px 50px -26px rgba(0,0,0,.9),
    0 0 70px -28px rgba(45,212,191,.35);
}
.tk-front::before { /* diagonal gloss */
  content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background: linear-gradient(112deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.03) 24%, transparent 42%);
}
.tk-front::after { /* fine texture */
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .5;
  background-image: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px); background-size: 14px 14px;
  -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 62%); mask-image: linear-gradient(180deg, #000 0%, transparent 62%);
}
.tk-num { font-weight: 700; line-height: 1; color: transparent; -webkit-text-stroke: 1px rgba(94,234,212,.45); }
.tk-floor {
  position: absolute; left: 6%; right: -2%; bottom: -26px; height: 30px; z-index: -1;
  background: radial-gradient(closest-side, rgba(0,0,0,.65), transparent); filter: blur(6px);
}
.tk-card:focus-visible { outline: none; }
.tk-card:focus-visible .tk-front { box-shadow: 0 0 0 2px #2dd4bf, 0 38px 50px -26px rgba(0,0,0,.9); }

@media (max-width: 767px) { .tk-box { transform: rotateY(15deg); } .tk-stage { padding-left: 22px; } .tk-spine { left: -22px; width: 22px; } }
@media (prefers-reduced-motion: reduce) {
  .tk-pin, .tk-fade { opacity: 1; animation: none !important; transform: none; }
  .tk-draw { stroke-dashoffset: 0; animation: none !important; }
  .tk-sweep { display: none; }
  .tk-box { transition: none; }
}
`;

/** Shared <style>, rendered once by the section. */
export function ToolkitDiagramStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)" } as const;

/** Shared gradient / filter defs. `p` namespaces the ids per diagram. */
function Defs({ p }: { p: string }) {
  return (
    <defs>
      <radialGradient id={`${p}-glow`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.30" />
        <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${p}-panel`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.13" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.03" />
      </linearGradient>
      <linearGradient id={`${p}-teal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#5eead4" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#0d9488" stopOpacity="0.12" />
      </linearGradient>
      <linearGradient id={`${p}-edge`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#5eead4" stopOpacity="0.9" />
        <stop offset="60%" stopColor="#ffffff" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.4" />
      </linearGradient>
      <filter id={`${p}-sh`} x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#000" floodOpacity="0.55" />
      </filter>
      <filter id={`${p}-blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
    </defs>
  );
}

/** 1 — Analyzer: a store page, numbered pins on it, a line out to the $ potential. */
export function AnalyzerDiagram({ potentialLabel }: { potentialLabel: string }) {
  const p = "an";
  const pins = [
    { n: 1, x: 112, y: 66, d: 0.2 },
    { n: 2, x: 196, y: 108, d: 0.4 },
    { n: 3, x: 96, y: 150, d: 0.6 },
    { n: 4, x: 206, y: 184, d: 0.8 },
  ];
  return (
    <svg viewBox="0 0 400 240" role="img" aria-hidden className="h-full w-full" fill="none">
      <Defs p={p} />
      <ellipse cx="200" cy="120" rx="190" ry="110" fill={`url(#${p}-glow)`} />
      {/* the store page */}
      <g filter={`url(#${p}-sh)`}>
        <rect x="42" y="22" width="224" height="200" rx="14" fill="#0b1114" />
        <rect x="42" y="22" width="224" height="200" rx="14" fill={`url(#${p}-panel)`} stroke={`url(#${p}-edge)`} strokeWidth="1" />
      </g>
      <line x1="42" y1="46" x2="266" y2="46" stroke="#fff" strokeOpacity="0.10" />
      <g fill="#fff" fillOpacity="0.25">
        <circle cx="58" cy="34" r="3" />
        <circle cx="70" cy="34" r="3" />
        <circle cx="82" cy="34" r="3" />
      </g>
      <rect x="104" y="28" width="120" height="12" rx="6" fill="#fff" fillOpacity="0.07" />
      {/* hero */}
      <rect x="58" y="58" width="192" height="52" rx="8" fill={`url(#${p}-teal)`} fillOpacity="0.55" stroke="#fff" strokeOpacity="0.10" />
      <rect x="70" y="72" width="86" height="6" rx="3" fill="#fff" fillOpacity="0.55" />
      <rect x="70" y="86" width="58" height="5" rx="2.5" fill="#fff" fillOpacity="0.28" />
      <rect x="70" y="97" width="34" height="8" rx="4" fill="#2dd4bf" fillOpacity="0.9" />
      {/* product grid */}
      {[58, 120, 182].map((x, i) => (
        <g key={x}>
          <rect x={x} y="120" width="60" height="50" rx="7" fill="#fff" fillOpacity="0.04" stroke="#fff" strokeOpacity="0.10" />
          <rect x={x + 8} y="128" width="44" height="22" rx="4" fill={`url(#${p}-teal)`} fillOpacity={0.35 + i * 0.1} />
          <rect x={x + 8} y="156" width="30" height="4" rx="2" fill="#fff" fillOpacity="0.30" />
        </g>
      ))}
      <rect x="58" y="180" width="192" height="30" rx="8" fill="#fff" fillOpacity="0.04" stroke="#fff" strokeOpacity="0.10" />
      <rect x="70" y="192" width="64" height="6" rx="3" fill="#fff" fillOpacity="0.25" />
      <rect x="196" y="190" width="42" height="10" rx="5" fill="#2dd4bf" fillOpacity="0.8" />
      {/* scan sweep */}
      <g className="tk-sweep">
        <rect x="42" y="46" width="34" height="176" fill="#5eead4" fillOpacity="0.16" />
      </g>
      {/* connector to the result */}
      <path
        d="M206 184 C 262 184, 276 124, 312 124"
        className="tk-draw"
        stroke="#5eead4"
        strokeOpacity="0.8"
        strokeWidth="1.25"
        strokeDasharray="3 4"
        style={{ ["--len" as string]: 170, ["--d" as string]: "1s" }}
      />
      {/* pins */}
      {pins.map((pin) => (
        <g key={pin.n} className="tk-pin" style={{ ["--d" as string]: `${pin.d}s` }}>
          <circle cx={pin.x} cy={pin.y} r="15" fill="#2dd4bf" fillOpacity="0.20" filter={`url(#${p}-blur)`} />
          <circle cx={pin.x} cy={pin.y} r="11" fill="#0a1114" stroke="#5eead4" strokeWidth="1.25" />
          <text x={pin.x} y={pin.y + 4.5} textAnchor="middle" fill="#5eead4" style={{ ...mono, fontSize: 13, fontWeight: 700 }}>
            {pin.n}
          </text>
        </g>
      ))}
      {/* result chip */}
      <g className="tk-fade" style={{ ["--d" as string]: "1.5s" }} filter={`url(#${p}-sh)`}>
        <rect x="304" y="86" width="84" height="74" rx="14" fill="#0b1114" />
        <rect x="304" y="86" width="84" height="74" rx="14" fill={`url(#${p}-teal)`} fillOpacity="0.5" stroke={`url(#${p}-edge)`} />
        <text x="346" y="120" textAnchor="middle" fill="#fff" style={{ ...mono, fontSize: 26, fontWeight: 700 }}>$</text>
        <path d="M322 144 l12 -9 l9 5 l13 -12 l10 6" stroke="#5eead4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="346" y="158" textAnchor="middle" fill="#fff" fillOpacity="0.75" style={{ ...mono, fontSize: 11 }}>
          {potentialLabel}
        </text>
      </g>
    </svg>
  );
}

function StoreCard({ p, x, y, rot, tone, hero }: { p: string; x: number; y: number; rot: number; tone: number; hero?: boolean }) {
  return (
    <g transform={`rotate(${rot} ${x + 74} ${y + 86})`} filter={`url(#${p}-sh)`}>
      <rect x={x} y={y} width="148" height="172" rx="13" fill="#0b1114" />
      <rect x={x} y={y} width="148" height="172" rx="13" fill={`url(#${p}-panel)`} stroke={hero ? "#5eead4" : "#fff"} strokeOpacity={hero ? 0.95 : 0.16} strokeWidth="1" />
      <rect x={x + 10} y={y + 10} width="40" height="9" rx="4.5" fill="#fff" fillOpacity="0.30" />
      <circle cx={x + 134} cy={y + 14} r="4" fill="#fff" fillOpacity="0.22" />
      <rect x={x + 10} y={y + 28} width="128" height="62" rx="8" fill={`url(#${p}-teal)`} fillOpacity={0.28 + tone * 0.16} stroke="#fff" strokeOpacity="0.10" />
      <path d={["M", x + 10, y + 84, "q", 32, -(22 + tone * 6), 64, -8, "t", 64, -(10 + tone * 4)].join(" ")} stroke="#fff" strokeOpacity="0.20" strokeWidth="1.2" />
      <rect x={x + 10} y={y + 100} width="84" height="6" rx="3" fill="#fff" fillOpacity="0.5" />
      <rect x={x + 10} y={y + 112} width="56" height="5" rx="2.5" fill="#fff" fillOpacity="0.25" />
      <rect x={x + 10} y={y + 130} width="52" height="24" rx="6" fill="#fff" fillOpacity="0.05" stroke="#fff" strokeOpacity="0.12" />
      <rect x={x + 68} y={y + 130} width="52" height="24" rx="6" fill="#fff" fillOpacity="0.05" stroke="#fff" strokeOpacity="0.12" />
    </g>
  );
}

/** 2 — Library: three fanned store cards, the top one lifted and marked. */
export function LibraryDiagram({ youLabel, topLabel }: { youLabel: string; topLabel: string }) {
  const p = "lb";
  return (
    <svg viewBox="0 0 400 240" role="img" aria-hidden className="h-full w-full" fill="none">
      <Defs p={p} />
      <ellipse cx="200" cy="124" rx="190" ry="108" fill={`url(#${p}-glow)`} />
      <g className="tk-fade" style={{ ["--d" as string]: "0.1s" }}>
        <StoreCard p={p} x={46} y={44} rot={-9} tone={0} />
      </g>
      <g className="tk-fade" style={{ ["--d" as string]: "0.25s" }}>
        <StoreCard p={p} x={206} y={44} rot={9} tone={1} />
      </g>
      <g className="tk-pin" style={{ ["--d" as string]: "0.45s" }}>
        <StoreCard p={p} x={126} y={26} rot={0} tone={2} hero />
        {/* star badge */}
        <circle cx="262" cy="42" r="14" fill="#0a1114" stroke="#5eead4" strokeWidth="1.25" />
        <path d="M262 33.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="#5eead4" />
      </g>
      {/* your store, closest to the winner */}
      <g className="tk-fade" style={{ ["--d" as string]: "0.9s" }}>
        <rect x="150" y="204" width="100" height="26" rx="13" fill="#0b1114" stroke="#fff" strokeOpacity="0.2" />
        <circle cx="166" cy="217" r="4" fill="#5eead4" />
        <text x="208" y="221.5" textAnchor="middle" fill="#fff" fillOpacity="0.8" style={{ ...mono, fontSize: 12 }}>
          {youLabel}
        </text>
      </g>
      <g className="tk-fade" style={{ ["--d" as string]: "1.1s" }}>
        <rect x="262" y="206" width="124" height="24" rx="12" fill="#2dd4bf" fillOpacity="0.14" stroke="#5eead4" strokeOpacity="0.7" />
        <text x="324" y="222" textAnchor="middle" fill="#5eead4" style={{ ...mono, fontSize: 12 }}>
          {topLabel}
        </text>
      </g>
    </svg>
  );
}

/** 3 — Simulator: three 7-day scenario curves against the break-even line. */
export function SimulatorDiagram({ breakEvenLabel, daysLabel }: { breakEvenLabel: string; daysLabel: string }) {
  const p = "sm";
  const xs = [58, 104, 150, 196, 242, 288, 334];
  const pts = (ys: number[]) => xs.map((x, i) => `${i ? "L" : "M"}${x} ${ys[i]}`).join(" ");
  const area = (ys: number[]) => `${pts(ys)} L334 196 L58 196 Z`;
  const aggressive = [178, 162, 134, 108, 90, 78, 70];
  const balanced = [182, 170, 150, 130, 116, 108, 102];
  const conservative = [186, 178, 164, 152, 144, 140, 136];
  const be = 120;
  return (
    <svg viewBox="0 0 400 240" role="img" aria-hidden className="h-full w-full" fill="none">
      <Defs p={p} />
      <defs>
        <linearGradient id="sm-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.40" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sm-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5eead4" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="200" cy="120" rx="190" ry="108" fill={`url(#${p}-glow)`} />
      <g filter={`url(#${p}-sh)`}>
        <rect x="30" y="20" width="340" height="206" rx="14" fill="#0b1114" />
        <rect x="30" y="20" width="340" height="206" rx="14" fill={`url(#${p}-panel)`} stroke={`url(#${p}-edge)`} />
      </g>
      <text x="46" y="42" fill="#fff" fillOpacity="0.5" style={{ ...mono, fontSize: 12, letterSpacing: "0.1em" }}>
        {daysLabel}
      </text>
      <g stroke="#fff" strokeOpacity="0.07">
        <line x1="50" y1="64" x2="352" y2="64" />
        <line x1="50" y1="108" x2="352" y2="108" />
        <line x1="50" y1="152" x2="352" y2="152" />
        <line x1="50" y1="196" x2="352" y2="196" strokeOpacity="0.18" />
      </g>
      {xs.map((x, i) => (
        <text key={x} x={x} y="214" textAnchor="middle" fill="#fff" fillOpacity="0.38" style={{ ...mono, fontSize: 11 }}>
          {`D${i + 1}`}
        </text>
      ))}
      <path d={area(aggressive)} fill="url(#sm-a)" className="tk-fade" style={{ ["--d" as string]: "0.2s" }} />
      <path d={area(conservative)} fill="url(#sm-b)" className="tk-fade" style={{ ["--d" as string]: "0.2s" }} />
      {/* break-even */}
      <g className="tk-fade" style={{ ["--d" as string]: "0.1s" }}>
        <line x1="50" y1={be} x2="352" y2={be} stroke="#fff" strokeOpacity="0.55" strokeDasharray="5 5" />
        <rect x="50" y={be - 22} width="94" height="18" rx="9" fill="#0a1114" stroke="#fff" strokeOpacity="0.22" />
        <text x="97" y={be - 9.5} textAnchor="middle" fill="#fff" fillOpacity="0.8" style={{ ...mono, fontSize: 11.5 }}>
          {breakEvenLabel}
        </text>
      </g>
      <path d={pts(conservative)} className="tk-draw" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ ["--len" as string]: 320, ["--d" as string]: "0.3s" }} />
      <path d={pts(balanced)} className="tk-draw" stroke="#5eead4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ["--len" as string]: 320, ["--d" as string]: "0.55s" }} />
      <path d={pts(aggressive)} className="tk-draw" stroke="#14b8a6" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" style={{ ["--len" as string]: 320, ["--d" as string]: "0.8s" }} />
      {/* crossing + end points */}
      <g className="tk-pin" style={{ ["--d" as string]: "1.5s" }}>
        <circle cx="242" cy="116" r="12" fill="#2dd4bf" fillOpacity="0.22" filter={`url(#${p}-blur)`} />
        <circle cx="242" cy="116" r="5.5" fill="#0a1114" stroke="#5eead4" strokeWidth="1.5" />
      </g>
      <g className="tk-pin" style={{ ["--d" as string]: "1.7s" }}>
        <circle cx="334" cy="70" r="4.5" fill="#14b8a6" />
        <circle cx="334" cy="102" r="4" fill="#5eead4" />
        <circle cx="334" cy="136" r="3.5" fill="#fff" fillOpacity="0.7" />
      </g>
    </svg>
  );
}
