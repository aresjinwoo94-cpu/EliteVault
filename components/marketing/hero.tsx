"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Lock, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataPill } from "@/components/ui/data-pill";
import { AnalyzerTeaserVideo } from "./analyzer-teaser-video";
import { ScanField, CornerBrackets } from "./scan-field";
import { useT } from "@/components/i18n/locale-provider";
import { createAnonAnalysis } from "@/app/actions/anon-analyzer";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Hero audit box — the activation funnel's front door (Tarea 1).
 *
 * The landing's ONE job is to turn cold traffic into a first audit, not to sell.
 * So the hero is a URL field + button that runs a real audit inline WITHOUT an
 * account, then hands the visitor their "aha" (score + annotated screenshot) on
 * /audit/[id], where a free-account gate takes over. The old "route to sign-up"
 * CTA is gone; the quiet secondary link still scrolls to the live demo.
 */
function HeroAuditBox() {
  const { t } = useT();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const value = url.trim();
    if (!value) {
      toast.error(t("hero.inputPlaceholder"));
      return;
    }
    startTransition(async () => {
      // Activation event — the first step of the anon funnel.
      try {
        if (typeof window !== "undefined" && (posthog as { __loaded?: boolean }).__loaded) {
          posthog.capture("anon_audit_started", { url: value });
        }
      } catch {
        /* analytics best-effort */
      }
      const res = await createAnonAnalysis({ url: value });
      if (!res.ok) {
        // Over the daily limit → nudge to a free account, don't just error.
        if (res.limited) {
          toast(res.error, {
            action: {
              label: t("anonGate.ctaPrimary"),
              onClick: () => router.push("/sign-up?next=/app/analyzer"),
            },
          });
        } else {
          toast.error(res.error);
        }
        return;
      }
      router.push(`/audit/${res.id}`);
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
        <div className="relative w-full sm:max-w-md">
          <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t("hero.inputPlaceholder")}
            aria-label={t("hero.inputPlaceholder")}
            disabled={isPending}
            className="h-12 pl-10 text-base"
          />
        </div>
        <Button
          size="xl"
          className="shrink-0"
          onClick={submit}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("hero.auditing")}
            </>
          ) : (
            <>
              {t("hero.auditButton")}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-1.5">
        <p className="text-xs tracking-wide text-white/35">{t("hero.anonMicro")}</p>
        <Link
          href="#analyzer"
          className="group -my-2 py-2 inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white/80"
        >
          {t("hero.ctaSecondary")}
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
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
    <div className="mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-xs text-white/50">
        <ShieldCheck className="size-3.5 text-champagne-400/80" />
        {t("hero.stripeBadge")}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-xs text-white/50">
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
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.96fr_1.04fr] lg:gap-8">
          {/* LEFT — the pitch. Centered while stacked on mobile/tablet so it
              matches the rest of the page; returns to left-aligned at lg where
              the asymmetric two-column split takes over. */}
          <div className="text-center lg:text-left">
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
              className="mt-6 max-w-xl mx-auto lg:mx-0 text-base leading-relaxed text-white/55 md:text-lg"
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
              <HeroAuditBox />
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
