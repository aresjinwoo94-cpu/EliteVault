"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/**
 * CountUp — the ONE signature data motion: a number that, on the client,
 * ticks from 0 to its value the first time it scrolls into view, then holds.
 *
 * CREDIBILITY-FIRST: the FIRST PAINT (SSR / no-JS / pre-hydration / reduced
 * motion) renders the FINAL VALUE, never a bare `0`. A tool whose value IS the
 * score can never be caught serving `0/100`. The count-up is a pure post-mount
 * enhancement: only after hydration, only on the client, only when motion is
 * allowed, do we briefly start from 0 and tween up to the value. Because the
 * initial render is identical on server and client (both = value), there is no
 * hydration mismatch.
 *
 * The tween is timer-based (not requestAnimationFrame, which pauses on
 * background frames) with a fallback start, so it ALWAYS lands on the value and
 * can never get stuck. Pair with `.num` / tabular-nums so digits don't jitter.
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
  // First paint = FINAL VALUE (SSR-safe, never a bare 0).
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    // Reduced motion (or value changes): just hold the final value, no tween.
    if (reduced) {
      setDisplay(value);
      return;
    }

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let interval: ReturnType<typeof setInterval> | undefined;

    const run = () => {
      if (started.current) return;
      started.current = true;
      // Post-mount enhancement only: start the count-up from 0 → value.
      setDisplay(0);
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

    // Start as soon as it's in view; the fallback ensures it never stalls.
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
