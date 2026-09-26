"use client";

import { motion } from "framer-motion";
import { ArrowDown, Megaphone, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/components/i18n/locale-provider";
import type { AnalysisResult } from "@/lib/supabase/types";
import {
  adReadinessWords,
  potentialBandForResult,
  potentialWhy,
  type CategoryKey,
} from "@/lib/analyzer/report-v2";

/**
 * Report hero v2 (analyzer-report-redesign brief §A.4 + hero refinement).
 *
 * The LEFT column of the hero row. It leads with what convinces a skeptical
 * operator, in this order:
 *
 *   1. The ad-readiness verdict IN WORDS (never a 0–100, never a rank) + the
 *      subtitle naming how many things are costing sales.
 *   2. The $ potential band as an estimate, with its "not your revenue" caveat.
 *   3. "Why this potential" — 3–4 short bullets DERIVED IN CODE from data the
 *      audit already produced (weakest rubric dimension + leak count). No new AI
 *      call, nothing on the critical path.
 *   4. A single CTA to the full, gated fixes list below.
 *
 * The per-fix mini-list was REMOVED here: it duplicated the full TopFixes
 * section, so the hero now names the count and links down instead. The
 * CategoryRadar "where you're leaking sales" sits in the RIGHT column of the
 * hero row (analysis-view.tsx), next to this.
 *
 * The score still exists as the internal engine of the band (brief §A.3); this
 * component simply never paints it.
 */

const VERDICT_TONE: Record<
  "ready" | "almost" | "not_ready",
  { badge: "success" | "warning" | "danger"; ring: string }
> = {
  ready: { badge: "success", ring: "border-success/25 from-success/[0.06]" },
  almost: {
    badge: "warning",
    ring: "border-champagne-400/25 from-champagne-400/[0.06]",
  },
  not_ready: {
    badge: "danger",
    ring: "border-destructive/25 from-destructive/[0.06]",
  },
};

/** Category key → its plain-language i18n label (never the raw rubric name). */
const CAT_LABEL_KEY: Record<CategoryKey, string> = {
  cro_principles: "report.v2CatCroPrinciples",
  niche_coherence: "report.v2CatNicheCoherence",
  technical_optimization: "report.v2CatTechnicalOptimization",
  layout_proportion: "report.v2CatLayoutProportion",
  image_quality: "report.v2CatImageQuality",
  color_integration: "report.v2CatColorIntegration",
};

export function ReportHeroV2({
  result,
  domain,
  onSeeFixes,
}: {
  result: AnalysisResult;
  domain: string | null;
  /** Smooth-scroll to the full, gated fixes section (section-fixes). */
  onSeeFixes: () => void;
}) {
  const { t } = useT();

  const words = adReadinessWords(result);
  const band = potentialBandForResult(result);
  const why = potentialWhy(result);
  const fixCount = why.leakCount;

  // "Why this potential" — composed in code from the audit's own data. Order:
  // niche demand → the weakest area → the lever (fixing the leaks) → honesty.
  const whyBullets: string[] = [
    t("report.v2WhyNiche"),
    ...(why.weakestCategoryKey
      ? [
          t("report.v2WhyWeakest").replace(
            "{cat}",
            t(CAT_LABEL_KEY[why.weakestCategoryKey]),
          ),
        ]
      : []),
    ...(fixCount > 0
      ? [
          fixCount === 1
            ? t("report.v2WhyLeverOne")
            : t("report.v2WhyLever").replace("{n}", String(fixCount)),
        ]
      : []),
    t("report.v2WhyHonest"),
  ];

  // The verdict headline + subline, in words. Falls back to a scoreless generic
  // when the audit predates the ad_readiness field. `chip` is the short verdict
  // label (Ad-ready / Almost / Not ad-ready), null on the generic fallback.
  const { headline, sub, tone, chip } = (() => {
    if (!words) {
      return {
        headline: t("report.v2VerdictGeneric"),
        sub: t("report.v2SubGeneric"),
        tone: VERDICT_TONE.almost,
        chip: null as string | null,
      };
    }
    const n = String(words.blockerCount);
    if (words.verdict === "ready") {
      return {
        headline: t("report.v2VerdictReady"),
        sub: t("report.v2SubReady"),
        tone: VERDICT_TONE.ready,
        chip: t("report.wallAdReady"),
      };
    }
    if (words.verdict === "almost") {
      return {
        headline: t("report.v2VerdictAlmost"),
        sub: t("report.v2SubAlmost").replace("{n}", n),
        tone: VERDICT_TONE.almost,
        chip: t("report.wallAdAlmost"),
      };
    }
    return {
      headline: t("report.v2VerdictNotReady"),
      sub: t("report.v2SubNotReady").replace("{n}", n),
      tone: VERDICT_TONE.not_ready,
      chip: t("report.wallAdNot"),
    };
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card
        className={`glow-card relative overflow-hidden bg-gradient-to-br to-transparent p-6 md:p-8 ${tone.ring}`}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-signal-500/10 blur-3xl" />

        <div className="relative">
          {/* Eyebrow + domain */}
          <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-white/40">
            <Megaphone className="size-3.5 text-signal-300" />
            <span>{t("report.v2Eyebrow")}</span>
            {domain && (
              <>
                <span aria-hidden className="text-white/20">
                  ·
                </span>
                <span className="font-mono normal-case tracking-normal text-white/45 truncate max-w-[220px]">
                  {domain}
                </span>
              </>
            )}
          </div>

          {/* 1 — the verdict IN WORDS (the hero), never a number. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl md:text-3xl tracking-tight leading-tight text-white">
              {headline}
            </h1>
            {chip && <Badge variant={tone.badge}>{chip}</Badge>}
          </div>
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-white/60">
            {sub}
          </p>

          {/* 2 — the $ potential band (secondary), with its caveat. */}
          {band && (
            <div className="mt-5 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-signal-400/25 bg-signal-500/[0.06] px-4 py-2.5">
              <TrendingUp className="size-4 text-signal-300" />
              <span className="text-[10px] uppercase tracking-widest text-white/45">
                {t("report.v2PotentialLabel")}
              </span>
              <span className="font-serif text-xl leading-none text-gold-gradient tnum">
                {band}
              </span>
              <span className="w-full text-[11px] leading-snug text-white/40 sm:w-auto sm:border-l sm:border-white/10 sm:pl-3">
                {t("report.v2PotentialCaption")}
              </span>
            </div>
          )}

          {/* 3 — "Why this potential": short, honest bullets derived in code
              from the audit's own data (weakest area + leak count). */}
          {whyBullets.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-widest text-white/40">
                {t("report.v2WhyHeading")}
              </p>
              <ul className="mt-2 space-y-1.5">
                {whyBullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[12.5px] leading-relaxed text-white/65"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal-400/60"
                    />
                    <span className="min-w-0">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 4 — the ONE CTA down to the full, gated fixes list. */}
          {fixCount > 0 && (
            <button
              type="button"
              onClick={onSeeFixes}
              className="group mt-6 inline-flex items-center gap-1.5 rounded-lg border border-signal-400/30 bg-signal-500/[0.08] px-3.5 py-2 text-[13px] font-medium text-signal-200 transition-colors hover:border-signal-400/50 hover:bg-signal-500/[0.15]"
            >
              {t("report.v2SeeAllFixes").replace("{n}", String(fixCount))}
              <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
            </button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
