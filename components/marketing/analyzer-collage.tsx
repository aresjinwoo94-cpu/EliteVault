import { CheckCircle2, Quote, Zap } from "lucide-react";

/**
 * Analyzer collage (landing §2) — the visual in the "A senior media buyer in a
 * tab" section. A hand-built, simplified DIAGRAM of the real audit (no
 * screenshots): it distills every deliverable EliteVault produces into one
 * compact, on-brand panel, framed as a browser tab to match the section title.
 *
 * What it conveys, mapped to the four steps on the left + the money:
 *   • reads your store        → the annotated store wireframe with pins
 *   • scores 6 dimensions     → the "where you're leaking sales" radar (54/100)
 *   • buyer-persona reaction  → the persona quote
 *   • 7-day Meta projection   → the ROAS scenario strip
 *   • the payoff              → the money-potential pill (replaces the old score
 *                               ring, which the product no longer shows)
 *
 * Values are illustrative (a product demo, like the prior mock), drawn from a
 * real example audit so the story is concrete. audit-snapshot.tsx stays in the
 * repo as the previous version; this component supersedes it in the section.
 */

const DIMENSIONS = [
  { label: "Color", v: 68 },
  { label: "Layout", v: 65 },
  { label: "Imagery", v: 75 },
  { label: "Tech", v: 48 },
  { label: "Niche fit", v: 32 },
  { label: "CRO", v: 42 },
] as const;

const FIXES = [
  { n: 1, text: "Typos in product titles kill trust on arrival", tone: "high" },
  { n: 2, text: "Fake 24:00:00 timer reads as a cheap urgency trick", tone: "med" },
  { n: 3, text: "Generic “Buy Now” hero adds friction before value", tone: "med" },
] as const;

const SCENARIOS = [
  { label: "Cons.", roas: "0.8×", tone: "loss" },
  { label: "Bal.", roas: "1.6×", tone: "gold" },
  { label: "Aggr.", roas: "2.3×", tone: "win" },
] as const;

export function AnalyzerCollage() {
  return (
    <div className="relative">
      {/* Ambient glow — teal (signal), matches the section accent. */}
      <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-tr from-signal-600/20 via-transparent to-signal-400/15 blur-2xl" />

      <div className="relative glass-strong overflow-hidden rounded-2xl shadow-2xl">
        {/* Browser chrome — the "in a tab" frame. */}
        <div className="flex items-center gap-2 border-b border-white/5 bg-obsidian-900/60 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-white/10" />
            <span className="size-2.5 rounded-full bg-white/10" />
            <span className="size-2.5 rounded-full bg-white/10" />
          </div>
          <div className="ml-2 flex-1 truncate rounded-md bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-white/40">
            elitevaultapp.com/app/analyzer
          </div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-success">
            <CheckCircle2 className="size-3" />
            <span className="hidden sm:inline">Audit complete</span>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* Headline row — money potential (replaces score) + overall grade. */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-signal-400/25 bg-signal-600/[0.06] px-3 py-2">
              <span className="text-[10px] uppercase tracking-wide text-white/50">
                Potential
              </span>
              <span className="font-serif text-xl leading-none text-gold-gradient tnum">
                ~$1k–8k
                <span className="ml-0.5 align-top text-xs text-white/45">/mo</span>
              </span>
              <span className="rounded-full border border-signal-400/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-signal-300">
                Fitness
              </span>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-lg leading-none tabular-nums text-white">
                54<span className="text-sm text-white/35">/100</span>
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-white/35">
                overall
              </p>
            </div>
          </div>

          {/* Main row — annotated store wireframe + the six-dimension radar. */}
          <div className="grid grid-cols-[1.15fr_1fr] gap-3">
            <StoreWireframe />
            <Radar />
          </div>

          {/* Buyer-persona reaction. */}
          <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <Quote className="mt-0.5 size-3.5 shrink-0 text-champagne-300" />
            <div className="min-w-0">
              <p className="text-[13px] leading-snug text-white/85">
                “Cute product, but typos and a random catalog raise red flags.”
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-white/35">
                Buyer-persona reaction · F 28–34 · US
              </p>
            </div>
          </div>

          {/* Ranked top fixes. */}
          <div className="rounded-xl border border-white/[0.06] bg-obsidian-900/30 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Zap className="size-3 text-champagne-400" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                Top fixes — ranked by leverage
              </p>
            </div>
            <ul className="space-y-1.5">
              {FIXES.map((f) => (
                <li key={f.n} className="flex items-center gap-2.5">
                  <span className="font-serif text-sm leading-none text-gold-gradient tnum">
                    {f.n}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-white/75">
                    {f.text}
                  </span>
                  <ImpactChip tone={f.tone} />
                </li>
              ))}
            </ul>
          </div>

          {/* 7-day Meta projection — the last deliverable, kept to a thin strip. */}
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-obsidian-900/30 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              7-day Meta
            </p>
            <div className="flex flex-1 items-center justify-end gap-1.5">
              {SCENARIOS.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-baseline gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1"
                >
                  <span className="text-[9px] uppercase tracking-wide text-white/40">
                    {s.label}
                  </span>
                  <span
                    className={`font-mono text-[12px] tabular-nums ${
                      s.tone === "loss"
                        ? "text-destructive"
                        : s.tone === "gold"
                          ? "text-champagne-300"
                          : "text-success"
                    }`}
                  >
                    {s.roas}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Simplified store wireframe with numbered finding pins — "reads your store". */
function StoreWireframe() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-gradient-to-br from-obsidian-800 to-obsidian-900">
      <div className="absolute inset-0 bg-dot-grid opacity-30" />
      <div className="relative aspect-[4/3] p-3">
        {/* mock nav */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-10 rounded-sm bg-white/10" />
          <div className="ml-auto flex gap-1.5">
            <div className="h-1.5 w-6 rounded-sm bg-white/[0.06]" />
            <div className="h-1.5 w-6 rounded-sm bg-white/[0.06]" />
          </div>
        </div>
        {/* mock hero */}
        <div className="mt-2.5 h-10 rounded-md border border-white/[0.05] bg-gradient-to-br from-white/[0.06] to-white/[0.02]" />
        {/* mock product grid */}
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-md border border-white/[0.05] bg-white/[0.03]"
            />
          ))}
        </div>

        {/* finding pins */}
        <Pin n={1} className="left-[16%] top-[30%]" tone="high" />
        <Pin n={2} className="right-[10%] top-[12%]" tone="med" />
        <Pin n={3} className="left-[46%] bottom-[16%]" tone="low" />
      </div>
    </div>
  );
}

const PIN_BG: Record<string, string> = {
  high: "#EF4444",
  med: "#FB923C",
  low: "#22C55E",
};

function Pin({
  n,
  className = "",
  tone,
}: {
  n: number;
  className?: string;
  tone: "high" | "med" | "low";
}) {
  return (
    <span
      className={`absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[9px] font-semibold text-white ${className}`}
      style={{
        background: PIN_BG[tone],
        border: "2px solid rgba(255,255,255,0.9)",
        boxShadow: "0 2px 8px -1px rgba(0,0,0,0.55)",
      }}
    >
      {n}
    </span>
  );
}

/** Six-dimension conversion radar — "where you're leaking sales". Pure SVG. */
function Radar() {
  const cx = 80;
  const cy = 74;
  const R = 46;
  const n = DIMENSIONS.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) =>
    [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))] as const;

  const gridRings = [0.33, 0.66, 1];
  const ring = (f: number) =>
    DIMENSIONS.map((_, i) => pt(i, R * f).join(",")).join(" ");
  const dataPoly = DIMENSIONS.map((d, i) => pt(i, R * (d.v / 100)).join(",")).join(
    " ",
  );

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-white/[0.05] bg-obsidian-900/40 p-3">
      <p className="text-[11px] font-medium text-white/80">
        Where you’re leaking sales
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-white/40">
        Six conversion dimensions — lowest = where cold traffic slips away.
      </p>

      <svg
        viewBox="0 0 160 150"
        className="mt-1 w-full"
        role="img"
        aria-label="Radar of six conversion dimensions"
      >
        {gridRings.map((f, i) => (
          <polygon
            key={i}
            points={ring(f)}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}
        {DIMENSIONS.map((_, i) => {
          const [x, y] = pt(i, R);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          );
        })}
        <polygon
          points={dataPoly}
          fill="rgba(45,212,191,0.18)"
          stroke="#2dd4bf"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {DIMENSIONS.map((d, i) => {
          const [lx, ly] = pt(i, R + 12);
          return (
            <text
              key={d.label}
              x={lx}
              y={ly}
              fill="rgba(255,255,255,0.45)"
              fontSize={7}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function ImpactChip({ tone }: { tone: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    high: { label: "high", cls: "border-destructive/30 bg-destructive/[0.06] text-destructive" },
    med: { label: "med", cls: "border-warning/30 bg-warning/[0.08] text-warning" },
    low: { label: "low", cls: "border-success/30 bg-success/[0.08] text-success" },
  };
  const m = map[tone] ?? map.med;
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
