"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

const PHASES = [
  "Capturing screenshot at retina resolution…",
  "Reading visual hierarchy & color system…",
  "Scoring against the CRO rubric…",
  "Simulating buyer-persona response…",
  "Placing annotations on the screenshot…",
  "Drafting top-impact fixes…",
];

export function AnalyzingState({
  status,
  startedAt,
}: {
  status: "queued" | "running";
  startedAt: string | null;
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

        <p className="mt-8 text-xs text-white/30 max-w-md mx-auto">
          Typical analyses complete in 30-90 seconds. If anything fails, your
          credit is refunded automatically.
        </p>
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
