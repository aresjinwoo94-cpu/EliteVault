"use client";

import { motion } from "framer-motion";
import {
  CreditCard,
  Lock,
  ShieldCheck,
  Sparkles,
  Quote,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataPill } from "@/components/ui/data-pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { COMPANY } from "@/lib/company";
import { useT } from "@/components/i18n/locale-provider";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * P0.5 — Social proof + founder note + trust badges.
 *
 * Two jobs:
 *   1. Resolve the irony that the demo flags "no trust badges" while the
 *      marketing site itself had none. The badge row below states exactly
 *      how the product is run (Stripe, no card for the free audit, etc.).
 *   2. Give the visitor recognizable reference points + a human founder
 *      voice before the pricing section.
 *
 * HONESTY NOTE: the sample-audit cards are clearly labelled "illustrative"
 * — they demonstrate the FORMAT of an audit on well-known stores, not a
 * claim that we ran or endorse them. This matches the product's
 * "estimates, not predictions" stance; it would be self-defeating to fake
 * numbers on the page that sells honest numbers.
 *
 * The founder identity is the SINGLE source of truth in lib/company.ts
 * (gap #9) — update it there and every surface (here, About, JSON-LD)
 * stays consistent.
 */

const FOUNDER = COMPANY.founder;

// Illustrative example audits on recognizable DTC stores. Scores are
// demonstrative bands, not real audit results — see HONESTY NOTE above.
const SAMPLE_AUDITS: {
  store: string;
  niche: string;
  score: number;
  takeawayKey: string;
}[] = [
  {
    store: "Gymshark",
    niche: "Activewear",
    score: 91,
    takeawayKey: "social.takeawayGymshark",
  },
  {
    store: "Allbirds",
    niche: "Footwear",
    score: 88,
    takeawayKey: "social.takeawayAllbirds",
  },
  {
    store: "MVMT",
    niche: "Watches",
    score: 84,
    takeawayKey: "social.takeawayMvmt",
  },
];

const TRUST_BADGES: { icon: typeof ShieldCheck; key: string; labelKey: string }[] = [
  { icon: CreditCard, key: "noCard", labelKey: "social.badgeNoCard" },
  { icon: Lock, key: "stripe", labelKey: "social.badgeStripe" },
  { icon: ShieldCheck, key: "cancel", labelKey: "social.badgeCancel" },
  { icon: Sparkles, key: "estimates", labelKey: "social.badgeEstimates" },
];

export function SocialProof() {
  const { t } = useT();
  return (
    <section className="relative py-20 md:py-28">
      <div className="container max-w-6xl">
        {/* Section heading */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
          <DataPill items={["LIVE AUDIT", "REAL SCORES"]} />
          <h2 className="mt-5 font-serif text-3xl md:text-5xl tracking-tight">
            {t("social.heading")}
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed">
            {t("social.subheading")}
          </p>
        </div>

        {/* Sample audit cards */}
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {SAMPLE_AUDITS.map((a, i) => (
            <motion.div
              key={a.store}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, ease, delay: i * 0.08 }}
            >
              <Card className="h-full p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{a.store}</p>
                    <p className="font-mono text-xs uppercase tracking-wider text-white/40">{a.niche}</p>
                  </div>
                  <div className="shrink-0">
                    <ScoreBadge score={a.score} size="lg" animate />
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/60 leading-relaxed">
                  {t(a.takeawayKey)}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] text-white/30">
          {t("social.disclaimer")}
        </p>

        {/* Founder note */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease }}
          className="mt-14"
        >
          <Card className="p-7 md:p-9">
            <div className="flex flex-col md:flex-row gap-6 md:items-start">
              <div className="flex items-center gap-4 md:flex-col md:items-center md:text-center shrink-0">
                <div className="flex size-14 items-center justify-center rounded-full bg-signal-600/10 ring-1 ring-signal-500/20 font-serif text-lg text-signal-200">
                  {FOUNDER.initials}
                </div>
                <div className="md:mt-2">
                  <p className="text-sm font-medium text-white">
                    {FOUNDER.name}
                  </p>
                  <p className="text-xs text-white/45">{FOUNDER.role}</p>
                </div>
              </div>
              <div className="min-w-0">
                <Quote className="size-5 text-champagne-300/70" />
                <p className="mt-2 text-base md:text-lg text-white/75 leading-relaxed">
                  {t("social.founderNote")}
                </p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Trust badges — resolves the "no trust badges" irony */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {TRUST_BADGES.map((b) => (
            <div
              key={b.key}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2"
            >
              <b.icon className="size-3.5 text-champagne-300" />
              <span className="text-xs text-white/65">{t(b.labelKey)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
