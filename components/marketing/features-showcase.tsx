"use client";

import { motion } from "framer-motion";
import { Compass, Image as ImageIcon, Library, TrendingUp } from "lucide-react";
import { DataPill } from "@/components/ui/data-pill";
import { useT } from "@/components/i18n/locale-provider";

const FEATURES = [
  {
    icon: Library,
    titleKey: "features.feature1Title",
    bodyKey: "features.feature1Body",
    href: "#library",
  },
  {
    icon: ImageIcon,
    titleKey: "features.feature2Title",
    bodyKey: "features.feature2Body",
  },
  {
    icon: Compass,
    titleKey: "features.feature3Title",
    bodyKey: "features.feature3Body",
  },
  {
    icon: TrendingUp,
    titleKey: "features.feature4Title",
    bodyKey: "features.feature4Body",
  },
];

export function FeaturesShowcase() {
  const { t } = useT();
  return (
    <section id="library" className="py-24 md:py-32">
      <div className="container max-w-6xl">
        <div className="max-w-2xl">
          <DataPill items={[t("features.pill1"), t("features.pill2")]} />
          <h2 className="mt-5 font-serif text-4xl md:text-5xl tracking-tight leading-tight">
            {t("features.heading")}
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed text-lg">
            {t("features.subheading")}
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.titleKey}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="group rounded-2xl border border-white/[0.06] bg-card shadow-card p-6 hover:border-signal-500/25 transition-colors"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                <f.icon className="size-4 text-signal-300" />
              </div>
              <h3 className="mt-5 text-lg font-medium tracking-tight text-white">
                {t(f.titleKey)}
              </h3>
              <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                {t(f.bodyKey)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
