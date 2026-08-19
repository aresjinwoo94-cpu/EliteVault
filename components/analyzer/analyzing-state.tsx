"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Layers, ShieldCheck, Star, Store, Tag } from "lucide-react";
import type { DiscoverySignals } from "@/lib/analyzer/discovery-signals";

// v3.9.3 — phase list reflects the FULL audit pipeline so the user
// understands the analyzer doesn't just look at the screenshot, it also
// scrapes the full page text (reviews, trust badges, FAQ, body content,
// pricing). This matches what the analyzer agent actually receives.
const PHASES = [
  "Capturing first-impression screenshot…",
  "Scraping full page content (reviews, trust badges, FAQ)…",
  "Reading visual hierarchy & color system…",
  "Cross-checking above-the-fold against below-the-fold…",
  "Scoring against the CRO rubric (6 categories)…",
  "Simulating buyer-persona response…",
  "Placing annotations on the screenshot…",
  "Drafting top-impact fixes ranked by leverage…",
];

export function AnalyzingState({
  status,
  startedAt,
  previewScore,
  previewSummary,
  screenshotUrl,
  signals,
}: {
  status: "queued" | "running";
  startedAt: string | null;
  // P1.2 — instant teaser: a fast preliminary score shown while the full
  // audit (20-60s) is still running, to cut abandonment on the wait.
  previewScore?: number | null;
  previewSummary?: string | null;
  /**
   * WP-3 — progressive reveal. Both of these land within the first seconds of
   * the run and are polled in, so the wait stops being a blank spinner:
   * `screenshotUrl` is persisted by the capture step (the user sees their own
   * store), `signals` by the discovery step (what we already read off the page).
   *
   * Neither costs an AI call — they're already-paid-for work, previously just
   * invisible until the very end. Both are optional: when they're absent this
   * component renders exactly as it did before.
   */
  screenshotUrl?: string | null;
  signals?: DiscoverySignals | null;
}) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % PHASES.length);
    }, 2600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const t = setInterval(() => {
      setSecs(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [startedAt]);

  return (
    <Card className="relative overflow-hidden p-10 md:p-14">
      <BackgroundOrbs />

      <div className="relative text-center">
        <div className="mx-auto relative size-16">
          <div className="absolute inset-0 rounded-full bg-signal-600/20 blur-xl animate-pulse" />
          <div className="relative size-16 rounded-full bg-gradient-to-br from-signal-600 to-champagne-400 ring-1 ring-white/10 flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 6, ease: "linear", repeat: Infinity }}
              className="size-10 rounded-full border-2 border-white/30 border-t-white"
            />
          </div>
        </div>

        <h2 className="mt-8 font-serif text-3xl md:text-4xl tracking-tight">
          {status === "queued" ? "Queued…" : "Analyzing"}
        </h2>

        <motion.p
          key={phaseIdx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mt-3 text-sm text-white/55 min-h-[1.5rem]"
        >
          {PHASES[phaseIdx]}
        </motion.p>

        {startedAt && (
          <p className="mt-2 text-xs font-mono tabular-nums text-white/30 tnum">
            {secs}s elapsed
          </p>
        )}

        {/* WP-3 — the capture lands seconds in; show it. Seeing your own store
            being scanned is the difference between "is this working?" and
            "it's working". Nothing here changes the audit. */}
        {screenshotUrl && <CapturedShot url={screenshotUrl} />}

        {/* WP-3 — what discovery already read off the page. Facts, not
            estimates: the module drops anything it couldn't actually find. */}
        {signals && <SignalChips signals={signals} />}

        {/*
          P1.2 — instant teaser. The moment the fast preliminary score
          lands (a few seconds in), we surface it here so the user sees a
          real number while the full audit keeps running. Clearly labelled
          "preliminary" so it's never confused with the final score.
        */}
        {typeof previewScore === "number" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 mx-auto max-w-sm rounded-2xl border border-champagne-400/20 bg-champagne-400/[0.04] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-widest text-champagne-300/80">
              Preliminary score
            </p>
            <div className="mt-1 flex items-baseline justify-center gap-1.5">
              <span className="font-mono tabular-nums text-5xl tnum text-gold-gradient leading-none">
                {previewScore}
              </span>
              <span className="text-sm text-white/40">/ 100</span>
            </div>
            {previewSummary && (
              <p className="mt-2 text-xs text-white/60 leading-relaxed">
                {previewSummary}
              </p>
            )}
            <p className="mt-2 text-[10px] text-white/30">
              Refining the full audit — annotations, persona &amp; fixes…
            </p>
          </motion.div>
        )}

        <p className="mt-8 text-xs text-white/30 max-w-md mx-auto">
          Typical analyses complete in 30-90 seconds. If anything fails, your
          credit is refunded automatically.
        </p>

        {/*
          v3.9.3 — explicit "full page is being analyzed" reassurance.
          Users see the screenshot result and assume the AI only looked at
          the visible viewport. Make it crystal clear here that the FULL
          page is in scope, not just the screenshot.
        */}
        <div className="mt-6 mx-auto inline-flex items-center gap-2 rounded-full border border-champagne-400/20 bg-champagne-400/[0.04] px-3 py-1.5">
          <Layers className="size-3 text-champagne-300" />
          <span className="text-[11px] text-white/65">
            Analyzing the <span className="text-white">entire page</span>, not
            just the screenshot
          </span>
        </div>
      </div>
    </Card>
  );
}

/**
 * WP-3 — the captured screenshot, mid-audit.
 *
 * The capture step persists `screenshot_url` and the report page polls every
 * 1.5s, so this appears ~5-15s into a run that takes ~30-50s. Deliberately
 * presented as work-in-progress: dimmed, with a scan sweep passing over it, so
 * it reads as "we're looking at this" and never as a finished report.
 *
 * Capped in height — a full-page capture is up to 4500px tall and would push
 * the phase text and the elapsed timer off screen.
 */
function CapturedShot({ url }: { url: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mt-8 mx-auto max-w-2xl"
    >
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-obsidian-950 max-h-64 md:max-h-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Screenshot captured from your store, being analyzed"
          className="block w-full h-auto opacity-60"
        />
        {/* Fade the bottom edge — a tall capture is cropped, and a hard cut
            looks like a broken image rather than a deliberate crop. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-obsidian-950 to-transparent" />
        <motion.div
          aria-hidden
          animate={{ y: ["-10%", "110%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-signal-500/20 to-transparent"
        />
      </div>
      <p className="mt-2 text-[11px] text-white/35">
        Captured — reading the page now
      </p>
    </motion.div>
  );
}

/**
 * WP-3 — the facts discovery already pulled off the page, as chips.
 *
 * Every value here was scraped, not estimated (see
 * lib/analyzer/discovery-signals.ts), which is why it can be shown before the
 * audit finishes without competing with the final score: none of it IS the
 * score. It's evidence that the analyzer is reading the whole store, not just
 * the screenshot — the same reassurance the "entire page" pill makes in words.
 */
function SignalChips({ signals }: { signals: DiscoverySignals }) {
  const chips: { icon: ReactNode; label: string }[] = [];

  if (signals.rating) {
    chips.push({
      icon: <Star className="size-3 text-champagne-300" />,
      label: signals.rating,
    });
  }
  if (signals.priceRange) {
    chips.push({
      icon: <Tag className="size-3 text-champagne-300" />,
      label: signals.priceRange,
    });
  }
  if (signals.platform && signals.platform !== "custom") {
    chips.push({
      icon: <Store className="size-3 text-champagne-300" />,
      label: capitalize(signals.platform),
    });
  }
  for (const claim of signals.trust) {
    chips.push({
      icon: <ShieldCheck className="size-3 text-champagne-300" />,
      label: claim,
    });
  }
  if (signals.pages > 1) {
    chips.push({
      icon: <Layers className="size-3 text-champagne-300" />,
      label: `${signals.pages} pages read`,
    });
  }

  if (chips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="mt-5"
    >
      <p className="text-[10px] uppercase tracking-widest text-white/30">
        Detected so far
      </p>
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/65"
          >
            {chip.icon}
            {chip.label}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function BackgroundOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 size-64 rounded-full bg-signal-600/15 blur-3xl"
      />
      <motion.div
        animate={{ x: [0, -25, 0], y: [0, 15, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/4 right-1/4 size-72 rounded-full bg-champagne-400/10 blur-3xl"
      />
    </div>
  );
}
