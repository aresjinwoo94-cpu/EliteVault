"use client";

import { CountUp } from "@/components/ui/count-up";

/**
 * "The Scan" — the landing's single motion idea, expressed as reusable
 * primitives (landing brief §5). One language of hairlines + the brand
 * gradient (emerald → cyan → indigo) + glow, echoing the analyzer's scan
 * lines and the rotating `.ai-border` rectangle.
 *
 * Technical contract (all primitives honour it):
 *   • Motion runs ONLY under `prefers-reduced-motion: no-preference` — applied
 *     via Tailwind's `motion-safe:animate-*` (which compiles to exactly that
 *     media query) and `motion-reduce:*` for the static fallback frame.
 *   • Only `transform` / `opacity` animate — compositor-thread only, never
 *     layout. No `width/height/top/left` transitions.
 *   • Every layer is `aria-hidden` + `pointer-events-none`.
 *   • Pure SVG/CSS — no animation libraries, no `<canvas>`.
 */

/**
 * ScanField — ambient scanner backdrop for the hero's negative space
 * (placement A). Grid hairlines + a diffuse brand-gradient bloom pushed to
 * the edges/behind the mockup + a scan beam that sweeps top→bottom. The
 * gradient reads as *projected light*, never a slab behind the headline.
 */
export function ScanField({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className ?? ""}`}
    >
      {/* Hairline grid backdrop — brand accent ~5%, softly masked, slow drift.
          Oversized vertically so the drift never reveals an edge. */}
      <div className="absolute -inset-y-12 inset-x-0 mask-radial">
        <div className="scan-grid absolute inset-0 opacity-70 motion-safe:animate-grid-drift" />
      </div>

      {/* Glow bloom — pushed to the upper-right, behind where the demo card
          sits, so light spills toward the edges and not under the text. */}
      <div
        className="scan-bloom absolute right-[-8%] top-[-6%] h-[560px] w-[560px] rounded-full opacity-90 motion-safe:animate-glow-bloom"
      />
      {/* Second, quieter bloom bottom-left for balance. */}
      <div
        className="scan-bloom absolute bottom-[-14%] left-[-10%] h-[420px] w-[420px] rounded-full opacity-60 motion-safe:animate-glow-bloom"
        style={{ animationDelay: "-4s" }}
      />

      {/* Scan beam — a 1px gradient line sweeping down. Decorative, so under
          reduced-motion it simply isn't shown (no resting artefact). */}
      <div className="absolute inset-0 motion-safe:animate-scan-beam motion-reduce:hidden">
        <div className="scan-beam-line absolute inset-x-[8%] top-0 h-px" />
        <div className="scan-beam-line absolute inset-x-[8%] top-px h-px opacity-40 blur-[2px]" />
      </div>
    </div>
  );
}

/**
 * CornerBrackets — four hairline "reticle" brackets in the brand gradient,
 * framing a mockup/card like a camera viewfinder (landing brief §5 primitive 3).
 * Wrap around a `relative` element. Breathes subtly; static under reduced-motion.
 */
export function CornerBrackets() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 motion-safe:animate-reticle-breathe">
      <span className="scan-bracket left-[-6px] top-[-6px] rounded-tl-md border-b-0 border-r-0" />
      <span className="scan-bracket right-[-6px] top-[-6px] rounded-tr-md border-b-0 border-l-0" />
      <span className="scan-bracket bottom-[-6px] left-[-6px] rounded-bl-md border-r-0 border-t-0" />
      <span className="scan-bracket bottom-[-6px] right-[-6px] rounded-br-md border-l-0 border-t-0" />
    </div>
  );
}

/**
 * ScanDivider — an animated gradient hairline used to separate sections
 * (placement B). The bright node glides along a faint brand-gradient rule.
 * Under reduced-motion the rule stays; only the glide stops.
 */
export function ScanDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`relative mx-auto h-px w-full max-w-6xl overflow-hidden ${className ?? ""}`}>
      {/* Faint static rule. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(94,234,212,0.18) 20%, rgba(99,102,241,0.18) 80%, transparent)",
        }}
      />
      {/* Gliding bright node. */}
      <div className="scan-beam-line absolute left-0 top-0 h-px w-40 motion-safe:animate-shimmer motion-reduce:hidden" />
    </div>
  );
}

/**
 * ScoreRing — an SVG ring filled with the brand gradient whose number counts
 * up on scroll-in (landing brief §5 primitives 1·5). The signature "audit
 * score" object; sits beside the report. SSR-safe number via <CountUp/>.
 */
export function ScoreRing({
  value = 62,
  label = "AUDIT SCORE",
  size = 132,
}: {
  value?: number;
  label?: string;
  size?: number;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id="scoreRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {/* Progress — brand gradient. The dash draws to `pct`; the transition
            only touches stroke-dashoffset (compositor-safe) and is disabled
            under reduced-motion. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#scoreRingGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="motion-safe:[transition:stroke-dashoffset_1.2s_var(--ease-reveal)]"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="flex items-baseline justify-center gap-0.5">
            <CountUp
              value={value}
              durationMs={1200}
              className="font-mono text-3xl tabular-nums leading-none text-white"
            />
            <span className="font-mono text-xs tabular-nums text-white/40">/100</span>
          </div>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-signal-300/80">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
