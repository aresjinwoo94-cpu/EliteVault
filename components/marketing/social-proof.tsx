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
import { Badge } from "@/components/ui/badge";
import { COMPANY } from "@/lib/company";

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
  takeaway: string;
}[] = [
  {
    store: "Gymshark",
    niche: "Activewear",
    score: 91,
    takeaway: "Ruthless hierarchy, instant offer clarity, heavy social proof.",
  },
  {
    store: "Allbirds",
    niche: "Footwear",
    score: 88,
    takeaway: "Calm palette, strong sustainability story, fast above-the-fold.",
  },
  {
    store: "MVMT",
    niche: "Watches",
    score: 84,
    takeaway: "Bold imagery and urgency, but trust badges sit below the fold.",
  },
];

const TRUST_BADGES: { icon: typeof ShieldCheck; label: string }[] = [
  { icon: CreditCard, label: "No credit card for your free audit" },
  { icon: Lock, label: "Payments secured by Stripe" },
  { icon: ShieldCheck, label: "Cancel anytime · no lock-in" },
  { icon: Sparkles, label: "Estimates, not predictions" },
];

export function SocialProof() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="container max-w-6xl">
        {/* Section heading */}
        <div className="text-center max-w-2xl mx-auto">
          <Badge variant="gold" className="mx-auto">
            <Sparkles className="size-3" />
            What a real audit looks like
          </Badge>
          <h2 className="mt-5 font-serif text-3xl md:text-5xl tracking-tight">
            The same lens the best stores already pass
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed">
            Here&apos;s how EliteVault grades a few recognizable winners.
            Illustrative examples — your own audit runs live on your URL.
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
              <Card className="h-full p-6 relative overflow-hidden">
                <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-champagne-400/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{a.store}</p>
                    <p className="text-xs text-white/40">{a.niche}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-serif text-4xl tnum text-gold-gradient leading-none">
                      {a.score}
                    </span>
                    <span className="block text-[10px] text-white/35">
                      / 100
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/60 leading-relaxed">
                  {a.takeaway}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] text-white/30">
          Illustrative example audits — demonstrative scores, not an
          endorsement or a real-time result.
        </p>

        {/* Founder note */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease }}
          className="mt-14"
        >
          <Card className="relative overflow-hidden p-7 md:p-9 border-violet-500/15 bg-gradient-to-br from-violet-600/[0.04] to-champagne-400/[0.03]">
            <div className="pointer-events-none absolute -left-12 -bottom-12 size-56 rounded-full bg-violet-600/10 blur-3xl" />
            <div className="relative flex flex-col md:flex-row gap-6 md:items-start">
              <div className="flex items-center gap-4 md:flex-col md:items-center md:text-center shrink-0">
                <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-champagne-400 ring-1 ring-white/10 font-serif text-lg text-white">
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
                  I built EliteVault because I was tired of guessing why a
                  store wasn&apos;t converting and paying $2k for a consultant
                  to tell me what an honest audit could in 60 seconds. So I
                  made the diagnosis free — run it on your own store, see the
                  exact score and the annotated screenshot, and only pay if you
                  want the prioritized cure. No fake numbers, no dark patterns,
                  cancel in two clicks.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Trust badges — resolves the "no trust badges" irony */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {TRUST_BADGES.map((b) => (
            <div
              key={b.label}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2"
            >
              <b.icon className="size-3.5 text-champagne-300" />
              <span className="text-xs text-white/65">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
