"use client";

import Link from "next/link";
import { m as motion } from "framer-motion";
import {
  Lock,
  Sparkles,
  Megaphone,
  TrendingUp,
  ArrowRight,
  Shield,
  Crown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Scale-only feature previews shown to Pro users (v3.9.2).
 *
 * Mirrors the visual chrome of the real Scale components (MetaAdsOptimizer
 * + MetaCampaignSimulator) but with teaser data and a lock overlay. The
 * goal is to make the Pro-to-Scale upgrade tangible: instead of just
 * telling them "Scale has Meta Ads optimization", show them WHAT it
 * looks like, blurred, with a one-click upgrade button.
 *
 * Why teaser data instead of real:
 *   • Pro accounts never actually run the Meta Ads agent (gated server-
 *     side at audit time), so meta_ads is null on their analysis.
 *   • Showing fake-but-plausible numbers lets us preview the FORMAT of
 *     what they'd get without lying about specifics.
 *   • Teaser numbers are clearly demonstrative — "2.5x ROAS target"
 *     etc. are bands the optimizer would actually produce.
 */

export function LockedMetaAdsPreview() {
  const { t } = useT();
  return (
    <LockWrapper
      icon={Megaphone}
      title={t("optimizer.title")}
      tagline="CPC, CPM, CTR & ROAS targets calibrated to YOUR audit, plus testing plan + creative angles"
    >
      {/* Targets row — same layout as the real component */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(
          [
            ["CPC", "$1.40", t("optimizer.maxBid")],
            ["CPM", "$22.50", t("optimizer.costK")],
            ["CTR", "2.20%", t("optimizer.ctr")],
            ["CVR", "3.40%", t("optimizer.lpConv")],
            ["ROAS", "2.5x", t("optimizer.targetReturn")],
          ] as const
        ).map(([label, val, sub]) => (
          <div
            key={label}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center"
          >
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              {label}
            </p>
            <p className="mt-1 font-mono tabular-nums text-xl tnum text-white">{val}</p>
            <p className="mt-0.5 text-[10px] text-white/40">{sub}</p>
          </div>
        ))}
      </div>

      {/* Audience + targeting */}
      <div className="mt-5 grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            {t("optimizer.audienceSeed")}
          </p>
          <p className="mt-1.5 text-xs text-white/65 leading-relaxed">
            {t("scaleLocked.seedDemo")}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            {t("scaleLocked.angles")}
          </p>
          <p className="mt-1.5 text-xs text-white/65 leading-relaxed">
            {t("scaleLocked.anglesDemo")}
          </p>
        </div>
      </div>
    </LockWrapper>
  );
}

export function LockedSimulatorPreview() {
  const { t } = useT();
  return (
    <LockWrapper
      icon={TrendingUp}
      title={t("scaleLocked.simTitle")}
      tagline="Project a Meta Ads campaign across 3 honest scenarios — conservative, balanced, aggressive — before you spend a dollar"
    >
      {/* Three scenario cards — same shape as the real ones */}
      <div className="grid md:grid-cols-3 gap-3">
        {[
          { variant: t("simulator.scCons"), roas: "1.4x", spend: "$280", net: "$112" },
          { variant: t("simulator.scBal"), roas: "2.1x", spend: "$350", net: "$385", primary: true },
          { variant: t("simulator.scAggr"), roas: "2.8x", spend: "$525", net: "$945" },
        ].map((s) => (
          <div
            key={s.variant}
            className={`rounded-xl border p-3 ${
              s.primary
                ? "border-champagne-400/25 bg-champagne-400/[0.04]"
                : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              {s.variant}
            </p>
            <p
              className={`mt-1 font-mono tabular-nums text-2xl tnum leading-none ${
                s.primary ? "text-gold-gradient" : "text-white"
              }`}
            >
              {s.roas}
            </p>
            <p className="text-[10px] text-white/40 mt-0.5">{t("simulator.roas7")}</p>
            <div className="mt-3 flex justify-between text-[10px]">
              <span className="text-white/45">{t("simulator.spend")}</span>
              <span className="font-mono tabular-nums tnum text-white/75">{s.spend}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-white/45">{t("simulator.net")}</span>
              <span className="font-mono tabular-nums tnum text-success">{s.net}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-white/40 text-center">
        {t("scaleLocked.perScenario")}
      </p>
    </LockWrapper>
  );
}

// ─── Shared wrapper ───────────────────────────────────────────────────

function LockWrapper({
  icon: Icon,
  title,
  tagline,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tagline: string;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden p-6 md:p-7 border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.04] to-signal-600/[0.04]">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 -bottom-12 size-56 rounded-full bg-signal-600/12 blur-3xl" />

        <div className="relative">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Icon className="size-4 text-champagne-400" />
                <h3 className="font-medium text-white">{title}</h3>
                <Badge variant="gold" className="shrink-0">
                  <Crown className="size-3" />
                  {t("simulator.scalePlan")}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm text-white/55 leading-relaxed max-w-2xl">
                {tagline}
              </p>
            </div>
          </div>

          {/*
            Preview content area — applies a subtle blur + dimming so the
            user can SEE the shape of what they'd get, but can't quite
            read the values. Combined with the overlay below, this drives
            curiosity → upgrade.
          */}
          <div className="relative">
            <div className="filter blur-[2px] opacity-65 select-none pointer-events-none">
              {children}
            </div>

            {/* Lock overlay — centered CTA on top of the blurred preview */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative flex flex-col items-center text-center max-w-sm px-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-champagne-400/15 ring-2 ring-champagne-400/30 backdrop-blur-sm">
                  <Lock className="size-5 text-champagne-300" />
                </div>
                <p className="mt-4 text-base font-medium text-white">
                  {t("scaleLocked.unlock")}
                </p>
                <p className="mt-1 text-xs text-white/55 leading-relaxed">
                  {t("scaleLocked.opens")}
                </p>
                <Link
                  href="/app/checkout?plan=scale&interval=month"
                  className="mt-4"
                >
                  <Button variant="primary" size="lg">
                    <Sparkles className="size-4" />
                    {t("scaleLocked.unlockPrice")}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
                <p className="mt-2 text-[10px] text-white/35 inline-flex items-center gap-1">
                  <Shield className="size-3" />
                  {t("scaleLocked.cancel")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
