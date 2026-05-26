"use client";

import { motion } from "framer-motion";
import { Brain, Eye, Scan, Sparkles, Target } from "lucide-react";
import { AnalyzerWalkthrough } from "./analyzer-walkthrough";

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
        {/*
          v3.4.1 — Give the visual (walkthrough) more room than the text.
          Was 50/50 which made the inner canvas only ~260px wide and
          squashed the 3 annotations into a vertical stack. Now text gets
          ~40%, visual gets ~60%, so the walkthrough canvas ends up ~380px
          and annotations can actually spread across a fake screenshot.
        */}
        <div className="grid lg:grid-cols-[2fr_3fr] gap-12 lg:gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease }}
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-600/10 px-3 py-1 text-[11px] uppercase tracking-wider text-violet-300">
                <Sparkles className="size-3" />
                The Analyzer · live demo →
              </div>
              <h2 className="mt-5 font-serif text-4xl md:text-5xl tracking-tight leading-tight">
                A senior media buyer in a tab.
              </h2>
              <p className="mt-4 text-white/55 leading-relaxed text-lg">
                Paste a URL. In under a minute, EliteVault returns the kind of
                audit you'd otherwise pay <span className="text-white/80">$1,500 for</span> —
                annotated screenshot, conversion-rate scenarios, persona
                reactions, and a brutal punch-list of fixes ranked by leverage.
                Watch a full run on the right.
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

          {/*
            v3.4 — Animated walkthrough replaces the static demo card.
            Plays a full audit run on loop (URL typing → analyzing →
            screenshot reveal → annotations cascade → score counter →
            conversion bars → persona quote → niche position bar).
            Cycle is ~12s. Respects prefers-reduced-motion.
          */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease }}
          >
            <AnalyzerWalkthrough />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
