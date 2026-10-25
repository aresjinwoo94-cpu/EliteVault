import {
  BarChart3,
  Calculator,
  Check,
  Database,
  Radar,
  ScanEye,
  Scale,
  X,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Stars } from "@/components/reviews/review-card";
import { getT } from "@/lib/i18n/server";
import { getReviewsVisibility } from "@/lib/reviews/visibility";
import { getWinningStoresCountRounded } from "@/lib/library/winning-sites-count";
import { ReviewsChipLink, TrustReveal } from "./trust-band-client";

/**
 * Trust band — sits between SocialStrip and AnalyzerDemo (replaces "Who it's
 * for"). It builds trust in the METHOD and the DATA, not in payments (Stripe /
 * SSL live in the hero and SocialProof, don't repeat them here).
 *
 * Every seal is a real EliteVault component, drawn with a Lucide icon — no
 * third-party logos. Each claim is backed by a verified fact in
 * docs/brief-2026-10-landing-teasers-trust.md §1; the optional "How?" disclosure
 * carries the honesty caveat. Notably it does NOT say the score is anchored in
 * the winners DB (ANALYZER_NICHE_GROUNDING is off by default).
 *
 * Server component: the live store count is cached (6 h) with a short timeout,
 * and the reviews chip renders only when the #reviews section does — both go
 * through shared helpers so nothing here can stall the page or leave a dead anchor.
 */

type Seal = {
  key: "s1" | "s2" | "s3" | "s4" | "s5" | "s6";
  icon: LucideIcon;
  hasHow: boolean;
};

const SEALS: Seal[] = [
  { key: "s1", icon: BarChart3, hasHow: true },
  { key: "s2", icon: Radar, hasHow: true },
  { key: "s3", icon: Database, hasHow: true },
  { key: "s4", icon: Calculator, hasHow: true },
  { key: "s5", icon: ScanEye, hasHow: false },
  { key: "s6", icon: Scale, hasHow: true },
];

export async function TrustBand() {
  const { t } = await getT();
  const [visibility, storeCount] = await Promise.all([
    getReviewsVisibility(),
    getWinningStoresCountRounded(),
  ]);

  const chip = visibility.show ? (
    <ReviewsChipLink ariaLabel={t("trustBand.chipAria")}>
      {visibility.showAggregate ? (
        <>
          <Stars value={Math.round(visibility.stats.average)} />
          <span>
            {t("trustBand.chipAggregate")
              .replace("{avg}", visibility.stats.average.toFixed(1))
              .replace("{count}", String(visibility.stats.count))}
          </span>
        </>
      ) : (
        <span>{t("trustBand.chipPlain")}</span>
      )}
      <ArrowRight className="size-4 text-signal-300" aria-hidden />
    </ReviewsChipLink>
  ) : null;

  const rows = [1, 2, 3] as const;

  return (
    <section
      aria-label={t("trustBand.eyebrow")}
      className="relative mt-16 md:mt-24"
    >
      <div className="container max-w-[1280px]">
        <TrustReveal>
          <div className="flex flex-col items-center gap-5 md:flex-row md:items-end md:justify-between">
            <div className="text-center md:text-left">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                {t("trustBand.eyebrow")}
              </p>
              <h2 className="mt-3 font-serif text-2xl tracking-tight text-balance md:text-3xl">
                {t("trustBand.heading")}
              </h2>
            </div>
            {/* desktop: right of the heading; on mobile it moves below the seals */}
            {chip && <div className="hidden md:block">{chip}</div>}
          </div>
        </TrustReveal>

        <ul className="mt-8 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3">
          {SEALS.map((s, i) => (
            <li key={s.key}>
              <TrustReveal delay={Math.min(i, 5) * 0.05} className="h-full">
                <div className="flex h-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 md:p-5">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                    <s.icon className="size-4 text-signal-300" aria-hidden />
                  </span>
                  <p className="mt-4 font-serif text-sm leading-snug text-white">
                    {t(`trustBand.${s.key}Title`)}
                    {s.key === "s3" && storeCount !== null && (
                      <span className="ml-2 inline-block rounded bg-signal-600/15 px-1.5 py-0.5 align-middle font-mono text-[10px] tabular-nums text-signal-300 ring-1 ring-signal-500/25">
                        {t("trustBand.s3Count").replace("{n}", String(storeCount))}
                      </span>
                    )}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/50">
                    {t(`trustBand.${s.key}Sub`)}
                  </p>
                  {s.hasHow && (
                    <details className="group mt-2.5 text-xs">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-signal-300/80 hover:text-signal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50 [&::-webkit-details-marker]:hidden">
                        {t("trustBand.howLabel")}
                      </summary>
                      <p className="mt-1.5 leading-relaxed text-white/55">
                        {t(`trustBand.${s.key}How`)}
                      </p>
                    </details>
                  )}
                </div>
              </TrustReveal>
            </li>
          ))}
        </ul>

        {/* Mini comparison vs. a generic AI chat (no brand named). EliteVault (✓) on the left, the generic chat (✗) on the right. */}
        <TrustReveal className="mt-6">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 md:p-6">
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              {t("trustBand.vsHeading")}
            </p>
            <ul className="mt-4 divide-y divide-white/[0.05]">
              {rows.map((n) => (
                <li
                  key={n}
                  className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-2 md:gap-6"
                >
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-white/85 md:text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-signal-300" aria-hidden />
                    <span>
                      <span className="sr-only">{t("trustBand.vsUs")}: </span>
                      {t(`trustBand.vs${n}Us`)}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-white/45 md:text-sm">
                    <X className="mt-0.5 size-4 shrink-0 text-white/30" aria-hidden />
                    <span>
                      <span className="sr-only">{t("trustBand.vsGeneric")}: </span>
                      {t(`trustBand.vs${n}Generic`)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </TrustReveal>

        {chip && <div className="mt-6 flex justify-center md:hidden">{chip}</div>}
      </div>
    </section>
  );
}
