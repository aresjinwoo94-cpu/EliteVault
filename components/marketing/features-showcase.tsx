"use client";

import { motion } from "framer-motion";
import { Compass, Image as ImageIcon, Library, TrendingUp } from "lucide-react";

const FEATURES = [
  {
    icon: Library,
    title: "A live portfolio of winners",
    body: "An AI agent watches paid-social cohorts and surfaces stores actually generating revenue right now — not a stale Pinterest board.",
    href: "#library",
  },
  {
    icon: ImageIcon,
    title: "Image-similarity search",
    body: "Drop a screenshot of your own store. We find the closest converting siblings by visual structure — not by tags.",
  },
  {
    icon: Compass,
    title: "Niche-aware judgment",
    body: "What works for skincare destroys conversion in supplements. The agent knows the difference.",
  },
  {
    icon: TrendingUp,
    title: "Campaign Scenario Modeler (Scale)",
    body: "Project a 7-day Meta Ads campaign across 3 honest scenarios — conservative, balanced, aggressive — calibrated to your audit, AOV and budget. Estimates, not guarantees.",
  },
];

export function FeaturesShowcase() {
  return (
    <section id="library" className="py-24 md:py-32">
      <div className="container max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="font-serif text-4xl md:text-5xl tracking-tight leading-tight">
            More than a checklist tool.
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed text-lg">
            EliteVault is the kind of leverage that used to belong to agencies
            and growth consultants. Now it lives in your dashboard.
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-card/40 p-6 hover:border-white/[0.12] transition-colors"
            >
              <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-champagne-400/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="flex size-10 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/10">
                <f.icon className="size-4 text-champagne-300" />
              </div>
              <h3 className="mt-5 text-lg font-medium tracking-tight text-white">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                {f.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
