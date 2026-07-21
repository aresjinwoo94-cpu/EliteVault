"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CreditCard,
  Info,
  Lock,
  ShieldCheck,
  Sparkles,
  Quote,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataPill } from "@/components/ui/data-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { COMPANY } from "@/lib/company";
import { useT } from "@/components/i18n/locale-provider";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Social proof — 3 REAL winning stores from the Library + founder note +
 * trust badges.
 *
 * The old version showed "illustrative" audit cards (Gymshark 91, …) with
 * a demonstrative-scores disclaimer. It now renders real Library entries
 * (fetched server-side in app/page.tsx and passed in as props), so the
 * numbers are the same conversion metrics a logged-in user sees — no
 * disclaimer needed. CTA routes to sign-in with next=/app/library.
 *
 * The founder identity is the SINGLE source of truth in lib/company.ts
 * (gap #9) — update it there and every surface (here, About, JSON-LD)
 * stays consistent.
 */

const FOUNDER = COMPANY.founder;

/** Serializable card data for a real Library store (built in app/page.tsx). */
export interface FeaturedStore {
  title: string;
  niche: string;
  thumbnailUrl: string;
  /** Real conv_rate metric from winning_sites.metrics, e.g. 4.4 */
  convRate: number | null;
}

const TRUST_BADGES: { icon: typeof ShieldCheck; key: string; labelKey: string }[] = [
  { icon: CreditCard, key: "noCard", labelKey: "social.badgeNoCard" },
  { icon: Lock, key: "stripe", labelKey: "social.badgeStripe" },
  { icon: ShieldCheck, key: "cancel", labelKey: "social.badgeCancel" },
  { icon: Sparkles, key: "estimates", labelKey: "social.badgeEstimates" },
];

export function SocialProof({ stores = [] }: { stores?: FeaturedStore[] }) {
  const { t } = useT();
  return (
    <section className="relative py-20 md:py-28">
      <div className="container max-w-6xl">
        {/* Section heading */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
          <DataPill items={["FROM THE LIBRARY", "REAL STORES"]} />
          <h2 className="mt-5 font-serif text-3xl md:text-5xl tracking-tight">
            {t("social.heading")}
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed">
            {t("social.subheading")}
          </p>
        </div>

        {/* Real winning stores from the Library */}
        {stores.length > 0 && (
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {stores.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, ease, delay: i * 0.08 }}
              >
                <Card className="h-full overflow-hidden p-0">
                  <div className="relative aspect-[4/3] overflow-hidden bg-obsidian-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.thumbnailUrl}
                      alt={`${s.title} — winning ${s.niche} store`}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover object-top"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-obsidian-950/80 to-transparent" />
                  </div>
                  <div className="flex items-start justify-between gap-3 p-5">
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{s.title}</p>
                      <p className="font-mono text-xs uppercase tracking-wider text-white/40">
                        {s.niche}
                      </p>
                    </div>
                    {s.convRate != null && (
                      <div className="shrink-0 rounded-lg bg-signal-600/10 px-2.5 py-1.5 text-right ring-1 ring-signal-500/20">
                        <p className="font-mono tabular-nums text-lg leading-none text-signal-300">
                          {s.convRate}%
                        </p>
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          <p className="text-[9px] uppercase tracking-wider text-white/40">
                            {t("social.convRate")}
                          </p>
                          <Tooltip>
                            <TooltipTrigger
                              aria-label={t("social.convRateTip")}
                              className="grid size-4 place-items-center rounded-full text-white/40 transition-colors hover:text-white/70 focus:text-white/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                            >
                              <Info className="size-3" aria-hidden="true" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[240px] text-left">
                              {t("social.convRateTip")}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Grid-level estimate disclaimer — no third-party conversion figure
            appears without the word "estimated" nearby and an explanation. */}
        {stores.length > 0 && (
          <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-white/35 leading-relaxed">
            {t("social.estimateDisclaimer")}
          </p>
        )}

        {/* CTA into the Library (post-login default also lands there) */}
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-white/55">{t("social.libraryCtaLead")}</p>
          <Link
            href="/sign-in?next=/app/library"
            className="inline-flex items-center gap-2 rounded-lg border border-signal-500/30 bg-signal-600/10 px-5 py-2.5 text-sm font-medium text-signal-200 transition-colors hover:bg-signal-600/20 hover:text-signal-100"
          >
            {t("social.libraryCta")}
            <ArrowRight className="size-4" />
          </Link>
        </div>

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
