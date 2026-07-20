"use client";

import { motion } from "framer-motion";
import { useT } from "@/components/i18n/locale-provider";

const LOGOS = [
  "Allbirds",
  "Gymshark",
  "Aesop",
  "Warby Parker",
  "Bombas",
  "Hims",
  "Glossier",
  "Casper",
  "Ridge",
  "OLIPOP",
];

export function LogoStrip() {
  const { t } = useT();
  return (
    <section className="py-16 border-y border-white/[0.04] bg-white/[0.01]">
      <div className="container">
        {/* Unambiguous caption: these are brands we STUDY, not customers.
            A logo wall under a hero reads as "trusted by" unless you say
            otherwise — so we say it outright and lower the visual weight
            (grayscale + ~40% opacity + smaller) so it can't be mistaken
            for a client logo wall. */}
        <p className="mx-auto max-w-2xl text-center text-sm text-white/50 leading-relaxed">
          {t("logoStrip.caption")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-3 opacity-45 grayscale">
          {LOGOS.map((name, i) => (
            <motion.span
              key={name}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="font-serif text-base text-white/40 transition-colors hover:text-white/70"
            >
              {name}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  );
}
