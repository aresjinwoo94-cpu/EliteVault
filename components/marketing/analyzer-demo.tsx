"use client";

import { motion } from "framer-motion";
import { Brain, Eye, Scan, Sparkles, Target } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  {
    icon: Eye,
    title: "Reads your store like a human",
    body: "Claude vision parses your hero, product grid, copy, color system, and motion — exactly what a senior CRO consultant would clock in the first 5 seconds.",
  },
  {
    icon: Scan,
    title: "Scores you against the rubric",
    body: "Six categories — color, layout, imagery, technical, niche fit, CRO principles — calibrated against the brands actually scaling on paid social.",
  },
  {
    icon: Brain,
    title: "Simulates your buyer persona",
    body: "Pick a persona (or define one) and watch them react to your store in their own voice. 'I'd bounce' beats any heatmap.",
  },
  {
    icon: Target,
    title: "Projects a 7-day campaign before you spend",
    body: "Scale-plan add-on: feed in your AOV + daily budget and the modeler returns 3 honest 7-day scenarios — conservative, balanced, aggressive — with day-by-day spend, ROAS and risks.",
  },
];

export function AnalyzerDemo() {
  return (
    <section id="analyzer" className="py-24 md:py-36">
      <div className="container max-w-6xl">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease }}
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-600/10 px-3 py-1 text-[11px] uppercase tracking-wider text-violet-300">
                <Sparkles className="size-3" />
                The Analyzer
              </div>
              <h2 className="mt-5 font-serif text-4xl md:text-5xl tracking-tight leading-tight">
                A senior media buyer in a tab.
              </h2>
              <p className="mt-4 text-white/55 leading-relaxed text-lg">
                Paste a URL or drop a screenshot. In under a minute, EliteVault
                returns the kind of audit you'd otherwise pay <span className="text-white/80">$1,500 for</span> —
                with annotations dropped exactly where the problems live.
              </p>
            </motion.div>

            <div className="mt-10 space-y-5">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5, ease }}
                  className="flex gap-4"
                >
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 ring-1 ring-violet-500/20">
                    <s.icon className="size-4 text-violet-300" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{s.title}</h3>
                    <p className="mt-1 text-sm text-white/50 leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease }}
            className="relative"
          >
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-violet-600/20 via-transparent to-champagne-400/20 blur-2xl" />
            <div className="relative glass-strong rounded-2xl overflow-hidden">
              <div className="aspect-[4/5] p-6 space-y-4">
                <div className="flex items-center justify-between text-xs text-white/40">
                  <span className="font-mono">store.example.com</span>
                  <span>just now</span>
                </div>
                <div className="rounded-xl border border-white/5 aspect-video bg-gradient-to-br from-obsidian-800 to-obsidian-700 relative overflow-hidden">
                  <div className="absolute inset-0 bg-dot-grid opacity-40" />
                  {/* arrow */}
                  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
                    <defs>
                      <marker
                        id="arrow"
                        markerWidth="6"
                        markerHeight="6"
                        refX="5"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M0,0 L0,6 L6,3 z" fill="#EF4444" />
                      </marker>
                    </defs>
                    <line
                      x1="10"
                      y1="80"
                      x2="35"
                      y2="50"
                      stroke="#EF4444"
                      strokeWidth="0.6"
                      markerEnd="url(#arrow)"
                    />
                  </svg>
                  <div className="absolute left-2 bottom-2 text-[10px] bg-destructive/15 backdrop-blur text-destructive border border-destructive/30 px-1.5 py-0.5 rounded">
                    CTA invisible
                  </div>
                </div>
                <div className="space-y-2">
                  {["Layout proportion", "Color integration", "CRO principles"].map(
                    (label, i) => (
                      <div key={label}>
                        <div className="flex justify-between text-[11px] text-white/60">
                          <span>{label}</span>
                          <span className="tnum">{[58, 71, 42][i]}</span>
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-white/5">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${[58, 71, 42][i]}%` }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.4 + i * 0.15, duration: 0.8, ease }}
                            className="h-full bg-gradient-to-r from-champagne-500 to-champagne-300 rounded-full"
                          />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
