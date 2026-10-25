"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Client-only bits of the (server) TrustBand: the once-per-viewport reveal and
 * the reviews chip's smooth scroll.
 *
 * The reveal is plain CSS driven by one IntersectionObserver instead of
 * framer-motion: this band sits right under the hero, and ~10 hydrated motion
 * nodes were measurable main-thread work on the page's LCP path. Under
 * prefers-reduced-motion the transition is disabled (content just appears).
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
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-shown={shown}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
      className={[
        "translate-y-3.5 opacity-0 transition-[opacity,transform] duration-500 ease-out",
        "data-[shown=true]:translate-y-0 data-[shown=true]:opacity-100",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
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
