"use client";

import { motion } from "framer-motion";
import { Brain, Eye, Scan, Target } from "lucide-react";
import { AuditSnapshot } from "./audit-snapshot";
import { AnalyzerBg } from "./analyzer-bg";
import { DataPill } from "@/components/ui/data-pill";
import { useT } from "@/components/i18n/locale-provider";

const ease = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  {
    icon: Eye,
    key: "stepReads",
    titleKey: "analyzerDemo.stepReadsTitle",
    bodyKey: "analyzerDemo.stepReadsBody",
  },
  {
    icon: Scan,
    key: "stepScores",
    titleKey: "analyzerDemo.stepScoresTitle",
    bodyKey: "analyzerDemo.stepScoresBody",
  },
  {
    icon: Brain,
    key: "stepPersona",
    titleKey: "analyzerDemo.stepPersonaTitle",
    bodyKey: "analyzerDemo.stepPersonaBody",
  },
  {
    icon: Target,
    key: "stepCampaign",
    titleKey: "analyzerDemo.stepCampaignTitle",
    bodyKey: "analyzerDemo.stepCampaignBody",
  },
];

export function AnalyzerDemo() {
  const { t } = useT();
  return (
    <section
      id="analyzer"
      className="relative overflow-hidden py-24 md:py-36"
    >
      <AnalyzerBg />
      <div className="container relative max-w-6xl">
        {/*
          v3.4.1 — Give the visual more room than the text (~40/60 split)
          so the demo panel stays legible; the teaser video is a 2:1 UI
          recording that needs the width.
        */}
        <div className="grid lg:grid-cols-[2fr_3fr] gap-12 lg:gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease }}
            >
              <DataPill items={["THE ANALYZER", "LIVE DEMO"]} />
              <h2 className="mt-5 font-serif text-4xl md:text-5xl tracking-tight leading-tight">
                {t("analyzerDemo.heading")}
              </h2>
              <p className="mt-4 text-white/55 leading-relaxed text-lg">
                {t("analyzerDemo.subheadingPre")}{" "}
                <span className="text-white/80">{t("analyzerDemo.subheadingPrice")}</span>{" "}
                {t("analyzerDemo.subheadingPost")}
              </p>
            </motion.div>

            <div className="mt-10 space-y-5">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.key}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5, ease }}
                  className="flex gap-4"
                >
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                    <s.icon className="size-4 text-signal-300" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{t(s.titleKey)}</h3>
                    <p className="mt-1 text-sm text-white/50 leading-relaxed">
                      {t(s.bodyKey)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/*
            v3.5 — The real teaser video moved up to the hero (highest
            attention slot). This section now shows the static audit
            snapshot instead: the four steps on the left tell "how it
            works", the snapshot on the right shows "what you get".
          */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease }}
          >
            <AuditSnapshot />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
