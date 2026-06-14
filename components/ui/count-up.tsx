"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/**
 * CountUp — the ONE signature data motion: a number ticks from 0 to its
 * value the first time it scrolls into view, then holds.
 *
 * Robustness first: a timer-based tween (not requestAnimationFrame, which
 * pauses on non-visible/background frames) plus a fallback start guarantee
 * it ALWAYS lands on the value — it can never get stuck at 0 if the in-view
 * observer is slow to fire. Honors `prefers-reduced-motion` (renders the
 * final value immediately) and is hydration-safe (deterministic 0 on first
 * paint). Pair with `.num` / tabular-nums so digits don't jitter as they
 * widen.
 */
export function CountUp({
  value,
  durationMs = 800,
  decimals = 0,
  className,
}: {
  value: number;
  durationMs?: number;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let interval: ReturnType<typeof setInterval> | undefined;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const startT = Date.now();
      interval = setInterval(() => {
        const t = Math.min((Date.now() - startT) / durationMs, 1);
        setDisplay(value * easeOutCubic(t));
        if (t >= 1) {
          setDisplay(value);
          if (interval) clearInterval(interval);
        }
      }, 16);
    };

    // Start as soon as it's in view; the fallback ensures it never stays at 0.
    if (inView) run();
    const fallback = setTimeout(run, 1200);

    return () => {
      clearTimeout(fallback);
      if (interval) clearInterval(interval);
    };
  }, [inView, value, reduced, durationMs]);

  return (
    <span ref={ref} className={className}>
      {display.toFixed(decimals)}
    </span>
  );
}
