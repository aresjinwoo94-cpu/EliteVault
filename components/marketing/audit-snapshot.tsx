"use client";

import { CheckCircle2, AlertTriangle, Zap, TrendingUp } from "lucide-react";
import { ScoreRing } from "./scan-field";

/**
 * Audit snapshot — a rich, static "completed audit" card that shows what
 * the analyzer's output actually looks like. NOT animated; the real
 * product teaser video lives in the hero. The narrative is: hero shows
 * "watch the product actually run" → this shows "here's the deliverable
 * you walk away with".
 *
 * Layout:
 *   row 1: browser chrome with URL + status
 *   row 2: 2-col body
 *     LEFT (60%) — annotated mock screenshot with 4 numbered findings
 *     RIGHT (40%) — score + verdict, executive split (strengths/issues),
 *                   niche position bar, persona one-liner
 *   row 3: 3 top-fix cards as a horizontal strip
 */
export function AuditSnapshot() {
  return (
    <div className="relative">
      {/* Ambient glow — teal (signal) to match the analyzer section's accent */}
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-signal-600/20 via-transparent to-signal-400/15 blur-2xl pointer-events-none" />

      <div className="relative glass-strong rounded-2xl overflow-hidden shadow-2xl">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-obsidian-900/60">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-white/10" />
            <span className="size-2.5 rounded-full bg-white/10" />
            <span className="size-2.5 rounded-full bg-white/10" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-white/[0.04] px-3 py-1 text-xs text-white/40 font-mono">
            elitevaultapp.com/app/analyzer
          </div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-success">
            <CheckCircle2 className="size-3" />
            <span className="hidden sm:inline">Audit complete</span>
          </div>
        </div>

        {/* Main body — 2 columns */}
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-0">
          {/* LEFT: annotated mock screenshot (top) + category breakdown (fills
              the space that used to be an empty bottom-left gap). */}
          <div className="relative flex flex-col bg-gradient-to-br from-obsidian-800 to-obsidian-900 border-r border-white/[0.04]">
           <div className="relative aspect-[16/11] shrink-0 overflow-hidden">
            <div className="absolute inset-0 bg-dot-grid opacity-30" />

            {/* Slow scan-line sweeping the screenshot (teal→cyan `--grad-brand`)
                — reinforces the "scanning your store" idea. Decorative, so it
                hides under reduced-motion; GPU-only (transform/opacity). */}
            <div className="pointer-events-none absolute inset-0 z-[5] motion-safe:animate-scan-beam motion-reduce:hidden">
              <div className="scan-beam-line absolute inset-x-0 top-0 h-px opacity-70" />
              <div className="scan-beam-line absolute inset-x-0 top-px h-px opacity-30 blur-[2px]" />
            </div>

            {/*
              Mock store layout, framed by the same spinning conic-gradient
              border (`ai-border`) as the in-app analyzer launcher — the
              "AI is scanning this screenshot" cue. The ::before ring draws
              1px OUTSIDE the element, so overflow-hidden lives on an inner
              wrapper instead of the ai-border element itself.
            */}
            <div className="absolute inset-x-4 top-4 bottom-4 md:inset-x-6 md:top-6 md:bottom-6 ai-border rounded-xl">
              <div className="relative h-full w-full rounded-xl bg-gradient-to-br from-obsidian-700/30 to-obsidian-800/40 border border-white/[0.04] overflow-hidden">
                {/* Mock nav */}
                <div className="absolute inset-x-3 top-3 h-4 rounded-sm bg-white/[0.04]" />
                {/* Mock hero block */}
                <div className="absolute inset-x-3 top-10 h-16 rounded-md bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.04]" />
                {/* Mock product grid */}
                <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-md bg-white/[0.03] border border-white/[0.04]"
                    />
                  ))}
                </div>

                {/*
                  Annotation dots + labels. Every pin sits on its OWN row
                  (staggered y) — two labels on the same row grow toward
                  each other and overlap once the canvas drops below
                  ~450px (analyzer column / mobile).
                */}
                <SnapshotAnnotation
                  n={1}
                  x="26%"
                  y="22%"
                  side="right"
                  color="destructive"
                  label="CTA below fold"
                />
                <SnapshotAnnotation
                  n={2}
                  x="72%"
                  y="42%"
                  side="left"
                  color="warning"
                  label="Hero too quiet"
                />
                <SnapshotAnnotation
                  n={3}
                  x="24%"
                  y="64%"
                  side="right"
                  color="success"
                  label="Solid imagery"
                />
                <SnapshotAnnotation
                  n={4}
                  x="74%"
                  y="85%"
                  side="left"
                  color="destructive"
                  label="No trust badges"
                />
              </div>
            </div>

            <div className="absolute left-3 bottom-2 text-[11px] uppercase tracking-widest text-white/25">
              annotated screenshot
            </div>
           </div>

           {/* Category breakdown — fills the space below the screenshot that
               used to be an empty bottom-left gap; the 6 rubric categories as
               thin grad-brand bars + mono scores (reinforces "6 categories
               scored"). Never overlaps the pins or the right score panel. */}
           <CategoryBreakdown />
          </div>

          {/* RIGHT: audit summary — tighter paddings/type below md so the
              stacked mobile layout doesn't tower */}
          <div className="bg-obsidian-900/40 p-4 md:p-5 space-y-3 md:space-y-4">
            {/* Score ring — the signature "Scan" object: a brand-gradient ring
                that fills while a mono number counts up on scroll-in. */}
            <div className="flex items-center gap-4">
              <ScoreRing value={62} size={104} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="size-3 text-champagne-300" />
                  <span className="text-[11px] text-champagne-300">
                    Above the curve
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-white/45">
                  Better than 58% of stores in this niche.
                </p>
              </div>
            </div>

            {/* Strengths / Issues split */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">
                Strengths vs. issues
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg ring-1 ring-success/30 bg-success/[0.05] px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3 text-success" />
                    <span className="text-[10px] uppercase tracking-widest text-white/60">
                      Strengths
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-lg tabular-nums text-success">
                    4
                  </p>
                </div>
                <div className="rounded-lg ring-1 ring-destructive/30 bg-destructive/[0.05] px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="size-3 text-destructive" />
                    <span className="text-[10px] uppercase tracking-widest text-white/60">
                      Issues
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-lg tabular-nums text-destructive">
                    2
                  </p>
                </div>
              </div>
            </div>

            {/* Niche position bar */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">
                Where you stand
              </p>
              <div className="relative h-1.5 rounded-full bg-gradient-to-r from-destructive/40 via-warning/40 to-success/50">
                <span
                  className="absolute top-0 bottom-0 w-px bg-white/20"
                  style={{ left: "58%" }}
                />
                <span
                  className="absolute top-0 bottom-0 w-px bg-champagne-300/40"
                  style={{ left: "82%" }}
                />
                <span
                  className="absolute -top-1 size-3.5 rounded-full bg-champagne-400 ring-2 ring-champagne-400/30 shadow-[0_0_12px_-2px_rgba(245,198,116,0.7)]"
                  style={{ left: "62%", transform: "translateX(-50%)" }}
                />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-white/30">
                <span>0</span>
                <span>Niche · 58</span>
                <span>Top · 82</span>
                <span>100</span>
              </div>
            </div>

            {/* Persona quote */}
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
              <p className="text-[11px] text-white/65 leading-relaxed">
                "I'd bounce — the offer isn't obvious in the first 2 seconds."
              </p>
              <p className="mt-1.5 text-[10px] text-white/30">
                — buyer persona, F 28-34 US
              </p>
            </div>
          </div>
        </div>

        {/* Bottom strip — top 3 fixes */}
        <div className="border-t border-white/[0.04] bg-obsidian-900/30 px-4 py-2.5 md:px-5 md:py-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="size-3 text-champagne-400" />
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">
              Top fixes — ranked by leverage
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            {[
              { n: 1, title: "Move primary CTA above the fold", impact: "high", effort: "<1h" },
              { n: 2, title: "Add 3 trust badges below the hero", impact: "high", effort: "1-4h" },
              { n: 3, title: "Tighten hero headline to 7 words", impact: "med", effort: "<1h" },
            ].map((f) => (
              <div
                key={f.n}
                className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 flex items-start gap-2"
              >
                <span className="font-serif text-base text-gold-gradient tnum leading-none mt-0.5">
                  {f.n}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-white/85 leading-tight truncate">
                    {f.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/35">
                    {f.impact} impact · {f.effort}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Category breakdown — the 6 rubric categories as thin `--grad-brand` bars
 *  with mono tabular scores. Fills the space below the annotated screenshot
 *  and reinforces the "6 categories scored" claim. Static (no motion). */
const CATEGORIES: { name: string; score: number }[] = [
  { name: "Color", score: 74 },
  { name: "Layout", score: 58 },
  { name: "Imagery", score: 81 },
  { name: "Technical", score: 66 },
  { name: "Niche fit", score: 62 },
  { name: "CRO", score: 55 },
];

function CategoryBreakdown() {
  return (
    <div className="flex-1 border-t border-white/[0.04] bg-obsidian-900/30 p-3 md:p-4">
      <p className="mb-2.5 font-mono text-[11px] uppercase tracking-widest text-white/40">
        Category breakdown
      </p>
      <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
        {CATEGORIES.map((c) => (
          <div key={c.name} className="flex items-center gap-2">
            <span className="w-14 shrink-0 truncate text-[10px] text-white/55">
              {c.name}
            </span>
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${c.score}%`, background: "var(--grad-brand)" }}
              />
            </div>
            <span className="w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/70">
              {c.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Severity → solid pin color (shared visual language with the in-app overlay). */
const ANNOTATION_COLOR = {
  destructive: "#EF4444",
  warning: "#FB923C",
  success: "#22C55E",
} as const;

/** Solid numbered "pin" + glass label for the audit snapshot. Static — no animation. */
function SnapshotAnnotation({
  n,
  x,
  y,
  side,
  color,
  label,
}: {
  n: number;
  x: string;
  y: string;
  side: "left" | "right";
  color: "destructive" | "warning" | "success";
  label: string;
}) {
  const c = ANNOTATION_COLOR[color];

  const labelStyle =
    side === "right"
      ? {
          left: `calc(${x} + 16px)`,
          top: y,
          transform: "translateY(-50%)",
        }
      : {
          right: `calc(100% - ${x} + 16px)`,
          top: y,
          transform: "translateY(-50%)",
        };

  return (
    <>
      {/* Outer wrapper owns the -50%/-50% centering transform; the inner pin
          owns the scale animation, so the two transforms never clash. */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: x, top: y }}
      >
        <div
          className="grid place-items-center rounded-full text-[9px] font-semibold text-white motion-safe:animate-pin-drop"
          style={{
            width: 22,
            height: 22,
            background: c,
            border: "2px solid rgba(255,255,255,0.92)",
            boxShadow: "0 2px 8px -1px rgba(0,0,0,0.55)",
            // Stagger the drop-in by marker number (≈120ms) — "The Scan" pin-drop.
            animationDelay: `${(n - 1) * 0.12}s`,
          }}
        >
          {n}
        </div>
      </div>
      <div
        className="glass absolute hidden sm:flex items-center gap-1.5 text-[9px] text-white/85 px-1.5 py-0.5 rounded-md whitespace-nowrap pointer-events-none"
        style={labelStyle}
      >
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ background: c }}
        />
        {label}
      </div>
    </>
  );
}
