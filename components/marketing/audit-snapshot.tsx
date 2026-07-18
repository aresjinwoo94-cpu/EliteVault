"use client";

import { CheckCircle2, AlertTriangle, Zap, TrendingUp } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";

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
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-success">
            <CheckCircle2 className="size-3" />
            Audit complete
          </div>
        </div>

        {/* Main body — 2 columns */}
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-0">
          {/* LEFT: annotated mock screenshot */}
          <div className="relative aspect-[16/11] bg-gradient-to-br from-obsidian-800 to-obsidian-900 overflow-hidden border-r border-white/[0.04]">
            <div className="absolute inset-0 bg-dot-grid opacity-30" />

            {/* Mock store layout */}
            <div className="absolute inset-x-6 top-6 bottom-6 rounded-xl bg-gradient-to-br from-obsidian-700/30 to-obsidian-800/40 border border-white/[0.04] overflow-hidden">
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

              {/* Annotation dots + labels */}
              <SnapshotAnnotation
                n={1}
                x="28%"
                y="32%"
                side="right"
                color="destructive"
                label="CTA below fold"
              />
              <SnapshotAnnotation
                n={2}
                x="68%"
                y="32%"
                side="left"
                color="warning"
                label="Hero too quiet"
              />
              <SnapshotAnnotation
                n={3}
                x="22%"
                y="78%"
                side="right"
                color="success"
                label="Solid imagery"
              />
              <SnapshotAnnotation
                n={4}
                x="78%"
                y="78%"
                side="left"
                color="destructive"
                label="No trust badges"
              />
            </div>

            <div className="absolute left-3 bottom-2 text-[9px] uppercase tracking-widest text-white/25">
              annotated screenshot
            </div>
          </div>

          {/* RIGHT: audit summary */}
          <div className="bg-obsidian-900/40 p-5 space-y-4">
            {/* Score + verdict */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">
                Overall score
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <CountUp
                  value={62}
                  className="font-mono text-5xl tabular-nums text-signal-300 leading-none"
                />
                <span className="font-mono text-white/40 text-sm tabular-nums">
                  / 100
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <TrendingUp className="size-3 text-champagne-300" />
                <span className="text-[11px] text-champagne-300">
                  Above the curve
                </span>
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
              <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-white/30">
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
        <div className="border-t border-white/[0.04] bg-obsidian-900/30 px-5 py-3">
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
                  <p className="mt-0.5 text-[9px] text-white/35">
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
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full text-[9px] font-semibold text-white"
        style={{
          left: x,
          top: y,
          width: 22,
          height: 22,
          background: c,
          border: "2px solid rgba(255,255,255,0.92)",
          boxShadow: "0 2px 8px -1px rgba(0,0,0,0.55)",
        }}
      >
        {n}
      </div>
      <div
        className="glass absolute flex items-center gap-1.5 text-[9px] text-white/85 px-1.5 py-0.5 rounded-md whitespace-nowrap pointer-events-none"
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
