"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * "You are here" horizontal position bar.
 *
 * Shows where the user's audit score sits relative to two industry markers:
 *   • Niche average: ~58 (across all DTC stores we've seen)
 *   • Top 10%: ~82 (Aesop / Ridge / Hims tier)
 *
 * Visually answers "am I behind, average, or above the curve?" in 2 seconds —
 * a question the raw score number on its own doesn't answer.
 *
 * The benchmarks are baked-in averages from our Library + Community feed.
 * Not pulled from a live API — that'd be over-engineering for this version.
 */
const NICHE_AVG = 58;
const TOP_10_PCT = 82;

export function NichePositionBar({ score }: { score: number }) {
  // Normalize score to 0..100. (Some old runs return 0..1 decimal.)
  const s = score > 1 ? score : score * 100;
  const clamped = Math.max(0, Math.min(100, s));

  // Verdict band — used for the headline label
  const verdict =
    clamped >= TOP_10_PCT
      ? { label: "Top 10% of stores audited", tone: "text-success" }
      : clamped >= NICHE_AVG + 8
        ? { label: "Above the curve", tone: "text-champagne-300" }
        : clamped >= NICHE_AVG - 8
          ? { label: "Around average", tone: "text-white/65" }
          : clamped >= 40
            ? { label: "Below average — work to do", tone: "text-warning" }
            : { label: "Bottom quartile — fundamental issues", tone: "text-destructive" };

  return (
    <Card className="p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-champagne-400/8 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="size-4 text-champagne-400" />
          <h3 className="text-sm font-medium">Where you stand</h3>
        </div>
        <p className={`text-xs ${verdict.tone}`}>{verdict.label}</p>

        {/* Position bar */}
        <div className="mt-6 pb-12 relative">
          {/* Bar */}
          <div className="relative h-2 rounded-full bg-gradient-to-r from-destructive/40 via-warning/40 to-success/50 overflow-hidden">
            {/* Subtle grid ticks every 20 */}
            {[20, 40, 60, 80].map((t) => (
              <span
                key={t}
                className="absolute top-0 bottom-0 w-px bg-white/10"
                style={{ left: `${t}%` }}
              />
            ))}
          </div>

          {/* Niche average marker */}
          <Marker
            position={NICHE_AVG}
            label={`Niche avg · ${NICHE_AVG}`}
            color="rgba(255,255,255,0.45)"
            labelClass="text-white/45"
            delay={0.2}
            below
          />

          {/* Top 10% marker */}
          <Marker
            position={TOP_10_PCT}
            label={`Top 10% · ${TOP_10_PCT}`}
            color="rgba(245,198,116,0.6)"
            labelClass="text-champagne-300/85"
            delay={0.3}
            below
          />

          {/* User score — big animated marker */}
          <motion.div
            initial={{ left: "0%", opacity: 0 }}
            animate={{ left: `${clamped}%`, opacity: 1 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="absolute -top-1.5 -translate-x-1/2"
          >
            <div className="flex flex-col items-center">
              <div className="size-5 rounded-full bg-champagne-400 ring-4 ring-champagne-400/20 shadow-[0_0_20px_-2px_rgba(245,198,116,0.6)]" />
              <span className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-champagne-300">
                You · {Math.round(clamped)}
              </span>
            </div>
          </motion.div>

          {/* Endpoint labels */}
          <div className="mt-2 flex justify-between text-[10px] text-white/30 absolute left-0 right-0 -bottom-0">
            <span>0 · Broken</span>
            <span>100 · World-class</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Marker({
  position,
  label,
  color,
  labelClass,
  delay,
  below,
}: {
  position: number;
  label: string;
  color: string;
  labelClass: string;
  delay: number;
  below?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.6 }}
      className="absolute -translate-x-1/2"
      style={{ left: `${position}%`, top: below ? "0.5rem" : undefined }}
    >
      <div className="flex flex-col items-center">
        <div className="h-3 w-px" style={{ background: color }} />
        <span
          className={`mt-1 text-[9px] uppercase tracking-widest whitespace-nowrap ${labelClass}`}
        >
          {label}
        </span>
      </div>
    </motion.div>
  );
}
