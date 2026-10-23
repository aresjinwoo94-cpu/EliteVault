"use client";

import { m as motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Client-only bits of the (server) TrustBand: the once-per-viewport fade-in
 * (skipped under prefers-reduced-motion) and the reviews chip's smooth scroll.
 */
export function TrustReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/** In-page link to #reviews. The server only renders it when that section exists. */
export function ReviewsChipLink({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <a
      href="#reviews"
      aria-label={ariaLabel}
      onClick={(e) => {
        const el = document.getElementById("reviews");
        if (!el) return; // fall back to the native anchor jump
        e.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", "#reviews");
      }}
      className="inline-flex items-center gap-2 rounded-full border border-signal-500/30 bg-signal-600/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-signal-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50"
    >
      {children}
    </a>
  );
}
