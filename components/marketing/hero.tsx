"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataPill } from "@/components/ui/data-pill";
import { AnalyzerTeaserVideo } from "./analyzer-teaser-video";
import { useT } from "@/components/i18n/locale-provider";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Primary hero CTA — single, unambiguous focus.
 *
 * The old hero paired a URL <input> with the button. That created a second
 * decision ("do I paste now or later?") on cold traffic and split attention
 * from the one action that matters. We removed it: one strong primary CTA
 * that routes straight into sign-up → /app/analyzer (the analyzer-launcher
 * prompts for the URL at exactly the moment it can act on it), plus a quiet
 * secondary link that scrolls to the live demo for visitors who want to see
 * it work before committing.
 */
function HeroCta() {
  const { t } = useT();
  return (
    <div className="flex w-full max-w-xl flex-col items-start gap-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button asChild size="xl" className="shrink-0">
          <Link href="/sign-up?next=/app/analyzer">
            {t("hero.ctaPrimary")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Link
          href="#analyzer"
          className="group inline-flex items-center gap-1.5 px-1 text-sm text-white/55 transition-colors hover:text-white/85"
        >
          {t("hero.ctaSecondary")}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Stripe + SSL trust row. Deliberately quiet — hairline chips, muted text —
 * so it reassures without competing with the CTA. Reuses the same glass /
 * champagne language as the rest of the hero.
 */
function StripeTrust() {
  const { t } = useT();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/50">
        <ShieldCheck className="size-3.5 text-champagne-400/80" />
        {t("hero.stripeBadge")}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/50">
        <Lock className="size-3.5 text-champagne-400/80" />
        {t("hero.sslBadge")}
      </span>
    </div>
  );
}

export function Hero() {
  const { t } = useT();
  return (
    <section className="relative pt-32 pb-24 md:pt-44 md:pb-32 overflow-hidden">
      {/* radial backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-[30%] top-0 -translate-x-1/2 size-[1200px] rounded-full opacity-[0.6]"
          style={{
            background:
              "radial-gradient(circle, rgba(45, 212, 191,0.18) 0%, rgba(45,212,191,0.08) 35%, transparent 70%)",
          }}
        />
      </div>

      <div className="container max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          <DataPill items={[t("hero.badge1"), t("hero.badge2")]} />
        </motion.div>

        {/*
          P2.4 — LCP: the headline is the largest contentful paint element.
          `initial={false}` renders it at its final (visible) state in the
          SSR HTML instead of opacity:0-until-hydration, so it paints
          immediately. Speed = conversion; the supporting copy below still
          fades in.
        */}
        <motion.h1
          initial={false}
          className="mt-6 font-serif text-5xl md:text-7xl lg:text-8xl leading-[1.02] tracking-tight"
        >
          <span className="block">{t("hero.line1")}</span>
          <span className="block text-gold-gradient">{t("hero.line2")}</span>
          <span className="block">{t("hero.line3")}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.15 }}
          className="mt-7 max-w-2xl text-lg md:text-xl text-white/55 leading-relaxed"
        >
          {t("hero.subPre")}
          <span className="text-white/85">{t("hero.subHighlight")}</span>
          {t("hero.subPost")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.25 }}
          className="mt-10"
        >
          <HeroCta />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.6 }}
          className="mt-6 text-xs tracking-wide text-white/30"
        >
          {t("hero.trust")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.75 }}
        >
          <StripeTrust />
        </motion.div>
      </div>

      {/*
        Hero visual — the REAL product teaser video (54s screen recording
        of a full analyzer run), replacing the old static mockup card.
        Real product beats fabricated snapshot for cold-traffic trust; the
        static "deliverable" snapshot now lives in the AnalyzerDemo
        section further down. Lazy-loaded (poster paints instantly, video
        bytes stream in async) so it never competes with the headline LCP.
      */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1, ease, delay: 0.4 }}
        className="container mt-14"
      >
        <div className="mx-auto max-w-5xl">
          <AnalyzerTeaserVideo />
        </div>
      </motion.div>
    </section>
  );
}
