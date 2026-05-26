"use client";

import { useEffect, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  AnimatePresence,
} from "framer-motion";
import { CheckCircle2, Sparkles } from "lucide-react";

/**
 * Animated analyzer walkthrough — choreographed CSS/JS loop that
 * simulates a full audit run, shown on the landing page.
 *
 * Why this instead of a real screen recording:
 *   • ~12KB component vs 5-20MB MP4 — instant load on any connection
 *   • Vectorial — crisp from 320px to 4K screens
 *   • Loops perfectly without buffering or controls UI
 *   • Looks more premium than a janky recording of an early product
 *     (this is what Stripe / Linear / Vercel actually do — none of
 *     them use real videos in their landing demos)
 *
 * Stages (cycle = ~12 seconds, then restarts):
 *   0.0 - 1.2s   URL typewriter: "yourstore.com"
 *   1.2 - 1.8s   "Analyzing…" progress bar fills
 *   1.8 - 2.4s   Screenshot panel reveal (gradient + dots)
 *   2.4 - 4.2s   3 annotations animate in (numbered circles + labels)
 *   3.0 - 4.5s   Score counter ticks 0 → 62
 *   3.5 - 5.5s   Conversion-rate bars fill in
 *   5.5 - 7.0s   Persona quote typewriter
 *   7.0 - 8.5s   Niche position dot slides to its mark
 *   8.5 - 12s    Full state held, then loop restarts
 *
 * Accessibility: respects prefers-reduced-motion — if the user has it
 * on, we show the final state immediately and skip the choreography.
 */

const CYCLE_MS = 12_000;
const URL_STRING = "yourstore.com";
const PERSONA_QUOTE =
  "I'd bounce — the offer isn't obvious in the first 2 seconds.";

export function AnalyzerWalkthrough() {
  const [cycle, setCycle] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Detect prefers-reduced-motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (reducedMotion) return; // no looping in reduced-motion mode
    const t = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(t);
  }, [reducedMotion]);

  return (
    <div className="relative">
      {/* Ambient glow */}
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-violet-600/20 via-transparent to-champagne-400/20 blur-2xl pointer-events-none" />

      <div className="relative glass-strong rounded-2xl overflow-hidden shadow-2xl">
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
          {!reducedMotion && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-widest">
              <span className="size-1.5 rounded-full bg-success animate-pulse" />
              Live demo
            </div>
          )}
        </div>

        {/* The walkthrough — re-mounts every cycle to restart the timeline */}
        <Walkthrough key={cycle} skipAnimations={reducedMotion} />
      </div>
    </div>
  );
}

// ─── Walkthrough body ──────────────────────────────────────────────────────

function Walkthrough({ skipAnimations }: { skipAnimations: boolean }) {
  return (
    <div className="grid md:grid-cols-[1.3fr_1fr] gap-0">
      {/* LEFT: simulated analyzer canvas */}
      <div className="relative aspect-[4/3] md:aspect-[16/12] bg-gradient-to-br from-obsidian-800 to-obsidian-900 overflow-hidden border-r border-white/[0.04]">
        {/* URL input + analyze button */}
        <div className="absolute inset-x-4 top-4 z-10 flex gap-2">
          <div className="flex-1 rounded-md bg-obsidian-950/80 border border-white/10 px-3 py-1.5 text-xs font-mono text-white/85 flex items-center">
            <span className="text-white/40">https://</span>
            <TypewriterText
              text={URL_STRING}
              startDelayMs={300}
              charDelayMs={70}
              skip={skipAnimations}
            />
          </div>
          <motion.button
            initial={skipAnimations ? false : { opacity: 0.4, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.3, duration: 0.3 }}
            className="rounded-md bg-champagne-400 text-obsidian-900 text-xs font-medium px-3 py-1.5"
          >
            Analyze
          </motion.button>
        </div>

        {/* Analyzing progress bar (shown 1.2 - 1.8s) */}
        <motion.div
          initial={skipAnimations ? { opacity: 0 } : { opacity: 0 }}
          animate={
            skipAnimations
              ? { opacity: 0 }
              : { opacity: [0, 1, 1, 0] }
          }
          transition={{
            times: [0, 0.1, 0.85, 1],
            duration: 0.7,
            delay: 1.3,
          }}
          className="absolute inset-x-4 top-14 z-10"
        >
          <div className="rounded-md bg-violet-600/10 border border-violet-500/30 px-3 py-1.5 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-[11px] text-violet-200">
              Analyzing screenshot · scoring CRO · simulating persona…
            </span>
          </div>
        </motion.div>

        {/* Faux store screenshot (the "site being analyzed") */}
        <motion.div
          initial={skipAnimations ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: skipAnimations ? 0 : 1.8 }}
          className="absolute inset-x-8 top-16 bottom-6"
        >
          <div className="relative h-full rounded-xl bg-gradient-to-br from-obsidian-700/40 to-obsidian-800 border border-white/[0.06] overflow-hidden">
            <div className="absolute inset-0 bg-dot-grid opacity-30" />

            {/* Mock hero header */}
            <div className="absolute top-3 left-3 right-3 h-7 rounded-md bg-white/[0.04] border border-white/[0.06]" />
            {/* Mock hero image */}
            <div className="absolute top-12 left-3 right-3 h-20 rounded-md bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.04]" />
            {/* Mock product grid */}
            <div className="absolute bottom-3 left-3 right-3 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md bg-white/[0.03] border border-white/[0.04]"
                />
              ))}
            </div>

            {/* Annotations cascading in — positions spread diagonally across
                the mock screenshot, labels kept short so they don't overflow
                the narrow walkthrough canvas. */}
            <Annotation
              n={1}
              x="22%"
              y="25%"
              labelSide="right"
              color="destructive"
              label="CTA below fold"
              delay={2.4}
              skip={skipAnimations}
            />
            <Annotation
              n={2}
              x="68%"
              y="52%"
              labelSide="left"
              color="warning"
              label="Hero too quiet"
              delay={2.9}
              skip={skipAnimations}
            />
            <Annotation
              n={3}
              x="32%"
              y="82%"
              labelSide="right"
              color="success"
              label="Solid imagery"
              delay={3.4}
              skip={skipAnimations}
            />
          </div>
        </motion.div>

        {/* Bottom watermark */}
        {!skipAnimations && (
          <div className="absolute left-3 bottom-3 text-[9px] text-white/20 tracking-widest uppercase">
            ▸ Auto-replay
          </div>
        )}
      </div>

      {/* RIGHT: live audit panel */}
      <div className="bg-obsidian-900/40 p-4 md:p-5 space-y-3.5 min-w-0">
        {/* Score */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            Overall score
          </p>
          <div className="mt-1 flex items-baseline gap-1">
            <ScoreCounter
              target={62}
              delaySec={skipAnimations ? 0 : 3.0}
              durationSec={skipAnimations ? 0.01 : 1.4}
            />
            <span className="text-white/40 text-sm">/ 100</span>
          </div>
        </div>

        {/* Conversion-rate bars */}
        <div className="space-y-2.5">
          {(
            [
              ["Organic", 4.2, "champagne", 3.6],
              ["Meta — bad", 0.6, "destructive", 3.8],
              ["Meta — regular", 1.4, "warning", 4.0],
              ["Meta — good", 3.1, "success", 4.2],
            ] as const
          ).map(([label, val, tone, delay]) => (
            <div key={label}>
              <div className="flex justify-between text-[11px]">
                <span className="text-white/50">{label}</span>
                <span className="tnum text-white/80">{val}%</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={
                    skipAnimations
                      ? { width: `${Math.min(val * 18, 100)}%` }
                      : { width: 0 }
                  }
                  animate={{ width: `${Math.min(val * 18, 100)}%` }}
                  transition={{
                    delay: skipAnimations ? 0 : delay,
                    duration: skipAnimations ? 0.01 : 0.8,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={
                    tone === "champagne"
                      ? "h-full bg-gradient-to-r from-champagne-500 to-champagne-300"
                      : tone === "success"
                        ? "h-full bg-gradient-to-r from-success/70 to-success"
                        : tone === "warning"
                          ? "h-full bg-gradient-to-r from-warning/70 to-warning"
                          : "h-full bg-gradient-to-r from-destructive/70 to-destructive"
                  }
                />
              </div>
            </div>
          ))}
        </div>

        {/* Persona quote (typewriter) */}
        <motion.div
          initial={skipAnimations ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: skipAnimations ? 0 : 5.3, duration: 0.5 }}
          className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3"
        >
          <p className="text-[11px] text-white/65 leading-relaxed italic">
            "
            <TypewriterText
              text={PERSONA_QUOTE}
              startDelayMs={skipAnimations ? 0 : 5500}
              charDelayMs={28}
              skip={skipAnimations}
            />
            "
          </p>
          <p className="mt-2 text-[10px] text-white/30">
            — buyer persona, F 28-34 US
          </p>
        </motion.div>

        {/* Niche position */}
        <motion.div
          initial={skipAnimations ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: skipAnimations ? 0 : 7.0, duration: 0.4 }}
        >
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
            Where you stand
          </p>
          <div className="relative h-1.5 rounded-full bg-gradient-to-r from-destructive/40 via-warning/40 to-success/50 overflow-hidden">
            <span
              className="absolute top-0 bottom-0 w-px bg-white/15"
              style={{ left: "58%" }}
            />
            <span
              className="absolute top-0 bottom-0 w-px bg-champagne-300/40"
              style={{ left: "82%" }}
            />
          </div>
          <motion.div
            initial={
              skipAnimations
                ? { left: "62%", opacity: 1 }
                : { left: "0%", opacity: 0 }
            }
            animate={{ left: "62%", opacity: 1 }}
            transition={{
              delay: skipAnimations ? 0 : 7.2,
              duration: skipAnimations ? 0.01 : 1.0,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative -top-2.5 -translate-x-1/2 inline-block"
          >
            <span className="size-2.5 rounded-full bg-champagne-400 ring-2 ring-champagne-400/30 inline-block" />
          </motion.div>
          <div className="flex justify-between text-[9px] text-white/25 mt-0.5">
            <span>0</span>
            <span>Niche avg · 58</span>
            <span>Top 10% · 82</span>
            <span>100</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

/**
 * Character-by-character text reveal with a blinking cursor.
 * Set `skip` to render the full string instantly (reduced-motion mode).
 */
function TypewriterText({
  text,
  startDelayMs,
  charDelayMs,
  skip,
}: {
  text: string;
  startDelayMs: number;
  charDelayMs: number;
  skip: boolean;
}) {
  const [chars, setChars] = useState(skip ? text.length : 0);

  useEffect(() => {
    if (skip) return;
    let aborted = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const startTimer = setTimeout(() => {
      interval = setInterval(() => {
        if (aborted) return;
        setChars((c) => {
          if (c >= text.length) {
            if (interval) clearInterval(interval);
            return c;
          }
          return c + 1;
        });
      }, charDelayMs);
    }, startDelayMs);
    return () => {
      aborted = true;
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
    };
  }, [text, startDelayMs, charDelayMs, skip]);

  const showCursor = !skip && chars < text.length;
  return (
    <>
      {text.slice(0, chars)}
      {showCursor && (
        <span className="ml-px inline-block w-px h-3 bg-current align-middle animate-pulse" />
      )}
    </>
  );
}

/**
 * Score counter — animates from 0 to target over `durationSec`,
 * starting after `delaySec`. Display always shows the rounded int.
 */
function ScoreCounter({
  target,
  delaySec,
  durationSec,
}: {
  target: number;
  delaySec: number;
  durationSec: number;
}) {
  const v = useMotionValue(0);
  const display = useTransform(v, (n) => Math.round(n).toString());

  useEffect(() => {
    const controls = animate(v, target, {
      duration: durationSec,
      delay: delaySec,
      ease: [0.22, 1, 0.36, 1],
    });
    return controls.stop;
  }, [target, delaySec, durationSec, v]);

  return (
    <motion.span className="font-serif text-5xl tnum text-gold-gradient">
      {display}
    </motion.span>
  );
}

/**
 * Numbered annotation that fades + scales in onto the screenshot. The
 * label slides out to the side after the dot has settled.
 */
function Annotation({
  n,
  x,
  y,
  color,
  label,
  labelSide = "right",
  delay,
  skip,
}: {
  n: number;
  x: string;
  y: string;
  color: "destructive" | "warning" | "success";
  label: string;
  /** Side of the dot to place the label on, so it doesn't overflow the canvas edge. */
  labelSide?: "left" | "right";
  delay: number;
  skip: boolean;
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

  // Position the label on the chosen side of the dot, with a translate so
  // the label's edge anchors next to the dot — not the label's center.
  const labelStyle =
    labelSide === "right"
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
    <AnimatePresence>
      <motion.div
        key={`${n}-dot`}
        initial={skip ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: skip ? 0 : delay,
          duration: 0.45,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={`absolute -translate-x-1/2 -translate-y-1/2 size-5 rounded-full ring-2 backdrop-blur flex items-center justify-center text-[9px] font-bold text-white ${ring}`}
        style={{ left: x, top: y }}
      >
        {n}
      </motion.div>
      <motion.div
        key={`${n}-label`}
        initial={
          skip
            ? { opacity: 1, x: 0 }
            : { opacity: 0, x: labelSide === "right" ? -4 : 4 }
        }
        animate={{ opacity: 1, x: 0 }}
        transition={{
          delay: skip ? 0 : delay + 0.2,
          duration: 0.35,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={`absolute text-[9px] backdrop-blur px-1.5 py-0.5 rounded border whitespace-nowrap pointer-events-none ${labelBg}`}
        style={labelStyle}
      >
        {color === "success" ? "✓ " : ""}
        {label}
      </motion.div>
    </AnimatePresence>
  );
}
