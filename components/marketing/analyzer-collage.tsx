import { CheckCircle2, Megaphone, Package, Quote, Star, Swords, Truck } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Analyzer collage (landing §2) — the visual in the "A senior media buyer in a
 * tab" section. A hand-built, simplified DIAGRAM of the real audit (no
 * screenshots): it distills every deliverable EliteVault produces into one
 * compact, on-brand panel, framed as a browser tab to match the section title.
 *
 * What it conveys, mapped to the four steps on the left + the money:
 *   • reads your store        → the annotated store wireframe with pins
 *   • six dimensions          → the "where you're leaking sales" radar (no number is shown)
 *   • who is ahead of you     → the "Competitor insights" card: two stores side by side (generic icons, no brand)
 *   • buyer-persona reaction  → the persona quote
 *   • 7-day Meta projection   → the ROAS scenario strip
 *   • the payoff              → the money-potential pill + the verdict (report v2: the
 *                               product shows no 0–100 score any more)
 *
 * Values are illustrative (a product demo, like the prior mock), drawn from a
 * real example audit so the story is concrete. audit-snapshot.tsx stays in the
 * repo as the previous version; this component supersedes it in the section.
 */

const DIMENSIONS = [
  { label: "collage.dimColor", v: 68 },
  { label: "collage.dimLayout", v: 65 },
  { label: "collage.dimImagery", v: 75 },
  { label: "collage.dimTech", v: 48 },
  { label: "collage.dimNiche", v: 32 },
  { label: "collage.dimCro", v: 42 },
] as const;

const SCENARIOS = [
  { label: "collage.scCons", roas: "0.8×", tone: "loss" },
  { label: "collage.scBal", roas: "1.6×", tone: "gold" },
  { label: "collage.scAggr", roas: "2.3×", tone: "win" },
] as const;

export function AnalyzerCollage() {
  const { t } = useT();
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
            <span className="hidden sm:inline">{t("collage.complete")}</span>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* Headline row — money potential + verdict (report v2: no visible 0–100). */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-signal-400/25 bg-signal-600/[0.06] px-3 py-2">
              <span className="text-[10px] uppercase tracking-wide text-white/50">
                {t("collage.potential")}
              </span>
              <span className="font-serif text-xl leading-none text-gold-gradient tnum">
                {t("collage.potentialValue")}
                <span className="ml-0.5 align-top text-xs text-white/45">/mo</span>
              </span>
              <span className="rounded-full border border-signal-400/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-signal-300">
                {t("collage.niche")}
              </span>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="flex items-center gap-1.5 text-[11px] text-champagne-300">
                <Megaphone className="size-3.5" />
                {t("collage.notReady")}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-white/35">
                {t("collage.verdict")}
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
                {t("collage.quote")}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-white/35">
                {t("collage.persona")}
              </p>
            </div>
          </div>

          {/* Competitor insights — your store next to the strongest store of your niche (Pro). Generic icons only:
              no brand logo (trademark) and no real store. */}
          <div className="rounded-xl border border-champagne-400/20 bg-gradient-to-br from-champagne-400/[0.05] to-obsidian-900/30 p-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Swords className="size-3 shrink-0 text-champagne-400" />
                <p className="truncate font-mono text-[10px] uppercase tracking-widest text-white/50">
                  {t("collage.compTitle")}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-champagne-400/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-champagne-300">
                {t("collage.compPro")}
              </span>
            </div>
            <CompetitorChart />
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {CHIPS.map(({ key, Icon }) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/75"
                >
                  <Icon className="size-3 text-champagne-300" aria-hidden />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>

          {/* 7-day Meta projection — the last deliverable, kept to a thin strip. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-white/[0.06] bg-obsidian-900/30 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              {t("collage.meta7")}
            </p>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
              {SCENARIOS.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-baseline gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1"
                >
                  <span className="text-[9px] uppercase tracking-wide text-white/40">
                    {t(s.label)}
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

/** What the top store does that yours does not — three generic icons, 1–2 words each. No brands, no numbers. */
const CHIPS = [
  { key: "collage.compReviews", Icon: Star },
  { key: "collage.compBundles", Icon: Package },
  { key: "collage.compShipping", Icon: Truck },
] as const;

/**
 * Your store vs the top store of the niche, on the SAME axes (6 points, no scale, no figures — it is a picture
 * of the gap, not data). The top store rises (thick green line + fading fill); yours stays flat/down (dashed
 * coral). The area between them on the right is shaded and tagged "The gap". Each line is labelled at its end.
 */
function CompetitorChart() {
  const { t } = useT();
  const X = [8, 53.6, 99.2, 144.8, 190.4, 236];
  const TOP = [76, 72, 68, 54, 36, 18];
  const YOU = [64, 66, 68, 72, 76, 80];
  const pts = (ys: number[]) => ys.map((y, i) => `${X[i]},${y}`).join(" ");
  const topLine = pts(TOP);
  const youLine = pts(YOU);
  const baseline = 92;
  const topFill = `${X[0]},${baseline} ${topLine} ${X[5]},${baseline}`;
  // area between the lines over the right half (indices 3..5)
  const gap = [3, 4, 5].map((i) => `${X[i]},${TOP[i]}`).join(" ") + " " + [5, 4, 3].map((i) => `${X[i]},${YOU[i]}`).join(" ");
  const gapY = (TOP[4] + YOU[4]) / 2;
  return (
    <svg
      viewBox="0 0 320 100"
      className="block h-auto max-h-[112px] w-full"
      role="img"
      aria-label={t("collage.compAria")}
    >
      <defs>
        <linearGradient id="cc-top-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cc-gap-fill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {/* faint X axis, six ticks, no labels */}
      <line x1="0" y1={baseline} x2="248" y2={baseline} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {X.map((x) => (
        <line key={x} x1={x} y1={baseline} x2={x} y2={baseline + 3} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      ))}
      <polygon points={topFill} fill="url(#cc-top-fill)" />
      <polygon points={gap} fill="url(#cc-gap-fill)" />
      <polyline points={youLine} fill="none" stroke="#f87171" strokeWidth="2.2" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={topLine} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* "The gap" pill where the separation is largest */}
      <g transform={`translate(${X[4] - 33}, ${gapY - 9})`}>
        <rect width="66" height="18" rx="9" fill="#0b1210" stroke="rgba(251,191,36,0.55)" />
        <text x="33" y="12.4" textAnchor="middle" fontSize="9" fontWeight="600" fill="#fcd34d">
          {t("collage.compGap")}
        </text>
      </g>
      {/* direct end labels (no legend) */}
      <circle cx={X[5]} cy={TOP[5]} r="4" fill="#34d399" />
      <text x={X[5] + 9} y={TOP[5] + 3.5} fontSize="10" fontWeight="600" fill="#6ee7b7">
        {t("collage.compTopEnd")}
      </text>
      <circle cx={X[5]} cy={YOU[5]} r="3.5" fill="#f87171" />
      <text x={X[5] + 9} y={YOU[5] + 3.5} fontSize="10" fontWeight="600" fill="#fca5a5">
        {t("collage.compYouEnd")}
      </text>
    </svg>
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
  const { t } = useT();
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
        {t("collage.leaking")}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-white/40">
        {t("collage.sixDims")}
      </p>

      <svg
        viewBox="0 0 160 150"
        className="mt-1 w-full"
        role="img"
        aria-label={t("collage.radarAria")}
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
              {t(d.label)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
