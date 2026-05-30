"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Zap,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Primary hero CTA. We intentionally DON'T show a URL input here: the
 * audit requires a (verified-email) account first, so a paste-your-URL bar
 * on the landing would promise an instant analysis it can't deliver and
 * just adds friction before the same sign-up step. One clear button.
 */
function HeroCta() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Link href="/sign-up?next=/app/analyzer">
        <Button size="xl">
          Audit my store free
          <ArrowRight className="size-4" />
        </Button>
      </Link>
      <Link href="#analyzer">
        <Button variant="ghost" size="sm" className="text-white/55">
          or see it in action first
        </Button>
      </Link>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 md:pt-44 md:pb-32 overflow-hidden">
      {/* radial backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2 size-[1200px] rounded-full opacity-[0.6]"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.18) 0%, rgba(124,58,237,0.08) 35%, transparent 70%)",
          }}
        />
      </div>

      <div className="container max-w-5xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          <Badge variant="gold" className="mx-auto">
            <Sparkles className="size-3" />
            Powered by Claude — built for ecommerce founders
          </Badge>
        </motion.div>

        {/*
          P2.4 — LCP: the headline is the largest contentful paint element.
          `initial={false}` renders it at its final (visible) state in the
          SSR HTML instead of opacity:0-until-hydration, so it paints
          immediately. Speed = conversion; the supporting copy below still
          fades in.
        */}
        <motion.h1
          initial={false}
          className="mt-6 font-serif text-5xl md:text-7xl lg:text-8xl leading-[1.02] tracking-tight"
        >
          <span className="block">Copy what's</span>
          <span className="block text-gold-gradient italic">actually</span>
          <span className="block">converting.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.15 }}
          className="mx-auto mt-7 max-w-2xl text-lg md:text-xl text-white/55 leading-relaxed"
        >
          EliteVault hunts down stores that are <span className="text-white/85">already selling</span>,
          breaks down exactly why they convert, and gives your store the same
          brutal audit a senior media buyer would — annotated screenshots,
          buyer-persona simulations and a 7-day Meta Ads scenario modeler.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.25 }}
          className="mt-10"
        >
          <HeroCta />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.6 }}
          className="mt-6 text-xs tracking-wide text-white/30"
        >
          No credit card. 1 free analysis. Cancel anytime.
        </motion.p>
      </div>

      {/* hero preview card */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1, ease, delay: 0.4 }}
        className="container mt-20"
      >
        <HeroPreview />
      </motion.div>
    </section>
  );
}

/**
 * Hero preview — a rich, static "completed audit snapshot" that shows
 * what the analyzer's output actually looks like. NOT animated; the
 * animated walkthrough lives in the AnalyzerDemo section further down
 * the page. The narrative is: hero shows "this is the deliverable" →
 * walkthrough shows "this is how it gets built".
 *
 * Layout:
 *   row 1: browser chrome with URL + status
 *   row 2: 2-col body
 *     LEFT (60%) — annotated mock screenshot with 4 numbered findings
 *     RIGHT (40%) — score + verdict, executive split (strengths/issues),
 *                   niche position bar, persona one-liner
 *   row 3: 3 top-fix cards as a horizontal strip
 */
function HeroPreview() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-champagne-400/30 via-transparent to-violet-600/20 blur-xl" />
      <div className="relative glass-strong rounded-3xl p-2 shadow-2xl">
        <div className="rounded-2xl overflow-hidden bg-obsidian-950 border border-white/5">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-obsidian-900/60">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-white/10" />
              <span className="size-2.5 rounded-full bg-white/10" />
              <span className="size-2.5 rounded-full bg-white/10" />
            </div>
            <div className="ml-3 flex-1 rounded-md bg-white/[0.04] px-3 py-1 text-xs text-white/40 font-mono">
              elitevault.app/app/analyzer
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
                <HeroAnnotation
                  n={1}
                  x="28%"
                  y="32%"
                  side="right"
                  color="destructive"
                  label="CTA below fold"
                />
                <HeroAnnotation
                  n={2}
                  x="68%"
                  y="32%"
                  side="left"
                  color="warning"
                  label="Hero too quiet"
                />
                <HeroAnnotation
                  n={3}
                  x="22%"
                  y="78%"
                  side="right"
                  color="success"
                  label="Solid imagery"
                />
                <HeroAnnotation
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
                <p className="text-[10px] uppercase tracking-widest text-white/40">
                  Overall score
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-serif text-5xl tnum text-gold-gradient leading-none">
                    62
                  </span>
                  <span className="text-white/40 text-sm">/ 100</span>
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
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
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
                    <p className="mt-1 font-serif text-lg tnum text-success">
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
                    <p className="mt-1 font-serif text-lg tnum text-destructive">
                      2
                    </p>
                  </div>
                </div>
              </div>

              {/* Niche position bar */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
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
                <div className="mt-1 flex justify-between text-[9px] text-white/30">
                  <span>0</span>
                  <span>Niche · 58</span>
                  <span>Top · 82</span>
                  <span>100</span>
                </div>
              </div>

              {/* Persona quote */}
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
                <p className="text-[11px] text-white/65 leading-relaxed italic">
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
              <p className="text-[10px] uppercase tracking-widest text-white/40">
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
    </div>
  );
}

/** Small annotation dot + label for the hero mockup. Static — no animation. */
function HeroAnnotation({
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
  const ring =
    color === "destructive"
      ? "ring-destructive/50 bg-destructive/30"
      : color === "warning"
        ? "ring-warning/50 bg-warning/30"
        : "ring-success/50 bg-success/30";
  const labelBg =
    color === "destructive"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : color === "warning"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-success/15 text-success border-success/30";

  const labelStyle =
    side === "right"
      ? {
          left: `calc(${x} + 14px)`,
          top: y,
          transform: "translateY(-50%)",
        }
      : {
          right: `calc(100% - ${x} + 14px)`,
          top: y,
          transform: "translateY(-50%)",
        };

  return (
    <>
      <div
        className={`absolute -translate-x-1/2 -translate-y-1/2 size-5 rounded-full ring-2 backdrop-blur flex items-center justify-center text-[9px] font-bold text-white ${ring}`}
        style={{ left: x, top: y }}
      >
        {n}
      </div>
      <div
        className={`absolute text-[9px] backdrop-blur px-1.5 py-0.5 rounded border whitespace-nowrap pointer-events-none ${labelBg}`}
        style={labelStyle}
      >
        {color === "success" ? "✓ " : ""}
        {label}
      </div>
    </>
  );
}
