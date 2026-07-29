"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataPill } from "@/components/ui/data-pill";
import { AnalyzerTeaserVideo } from "./analyzer-teaser-video";
import { ScanField, CornerBrackets } from "./scan-field";
import { useT } from "@/components/i18n/locale-provider";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Primary hero CTA — single, unambiguous focus.
 *
 * One strong primary CTA that routes into sign-up → /app/analyzer (the
 * analyzer-launcher prompts for the URL at exactly the moment it can act on
 * it), plus a quiet secondary link that scrolls to the live demo for visitors
 * who want to see it work before committing.
 */
function HeroCta() {
  const { t } = useT();
  return (
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
  );
}

/**
 * Stripe + SSL trust row. Deliberately quiet — hairline chips, muted text —
 * so it reassures without competing with the CTA.
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
  const line3 = t("hero.line3");

  return (
    <section className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
      {/*
        "The Scan" ambient field (placement A) — grid hairlines + brand-gradient
        glow bloom pushed to the edges + a scan beam. Sits in the hero's negative
        space; the gradient reads as projected light, never a slab behind text.
        The legacy single radial wash is replaced by this coherent system.
      */}
      <ScanField />

      <div className="container max-w-[1280px]">
        {/*
          Asymmetric ~55/45 split (landing brief §3) — NEVER centered. Left
          column carries the argument, right column carries the proof (the real
          product teaser). Stacks on mobile: message first, demo second.
        */}
        <div className="grid items-center gap-10 lg:grid-cols-[0.96fr_1.04fr] lg:gap-8">
          {/* LEFT — the pitch */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
            >
              <DataPill items={[t("hero.badge1"), t("hero.badge2")]} />
            </motion.div>

            {/*
              LCP element — `initial={false}` renders the headline at its final
              visible state in the SSR HTML so it paints immediately. The
              highlighted phrase uses the brand gradient *text clip* (not a
              background slab) — allowed accenting, on-brand with the identity.
            */}
            <motion.h1 initial={false} className="hero-h1 mt-6 text-balance">
              {t("hero.line1")}{" "}
              <span className="text-gold-gradient">{t("hero.line2")}</span>
              {line3 ? <> {line3}</> : null}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease, delay: 0.15 }}
              className="mt-6 max-w-xl text-base leading-relaxed text-white/55 md:text-lg"
            >
              {t("hero.subPre")}
              <span className="text-white/85">{t("hero.subHighlight")}</span>
              {t("hero.subPost")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease, delay: 0.25 }}
              className="mt-8"
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

          {/* RIGHT — the proof: real analyzer teaser, framed by reticle brackets */}
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, ease, delay: 0.35 }}
            className="relative"
          >
            <CornerBrackets />
            <AnalyzerTeaserVideo />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
