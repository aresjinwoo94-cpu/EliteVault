"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Layers } from "lucide-react";

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
}: {
  status: "queued" | "running";
  startedAt: string | null;
  // P1.2 — instant teaser: a fast preliminary score shown while the full
  // audit (20-60s) is still running, to cut abandonment on the wait.
  previewScore?: number | null;
  previewSummary?: string | null;
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
          <div className="absolute inset-0 rounded-full bg-violet-600/20 blur-xl animate-pulse" />
          <div className="relative size-16 rounded-full bg-gradient-to-br from-violet-600 to-champagne-400 ring-1 ring-white/10 flex items-center justify-center">
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
          <p className="mt-2 text-xs font-mono text-white/30 tnum">
            {secs}s elapsed
          </p>
        )}

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
              <span className="font-serif text-5xl tnum text-gold-gradient leading-none">
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

function BackgroundOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 size-64 rounded-full bg-violet-600/15 blur-3xl"
      />
      <motion.div
        animate={{ x: [0, -25, 0], y: [0, 15, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/4 right-1/4 size-72 rounded-full bg-champagne-400/10 blur-3xl"
      />
    </div>
  );
}
