"use client";

import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";
import posthog from "posthog-js";
import { ArrowDown, ArrowRight, Crown, Shield, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";
import { PLANS } from "@/lib/stripe/plans";
import {
  META_PROMO_EVENTS,
  META_PROMO_SAMPLE,
  SCALE_CHECKOUT,
  metaPromoCta,
  type MetaPromoTier,
} from "@/lib/analyzer/meta-promo";

/**
 * WP-4 — the Meta Campaign Simulator promo: a teaser high in the report, a
 * persistent rail on wide screens and a bottom bar on narrow ones. Rendered
 * only when ANALYZER_META_PROMO is on (the report decides).
 *
 * These components take a tier and an analysis id (for analytics) and
 * nothing else. The locked version shows a frozen, labelled example, so there
 * is no real projection to leak — the gate that keeps the viewer's actual data
 * off the page lives server-side (lib/analyzer/client-payload.ts).
 */

type Placement = "teaser" | "rail" | "mobile_bar";

interface PromoProps {
  tier: MetaPromoTier;
  analysisId: string;
  /** Scroll to the report's Meta section. */
  onRun: () => void;
}

function capture(event: string, props: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && (posthog as { __loaded?: boolean }).__loaded) {
      posthog.capture(event, props);
    }
  } catch {
    /* best-effort */
  }
}

/** Fire the view event once, when at least half of the element is on screen. */
function useViewOnce(
  ref: RefObject<HTMLElement | null>,
  placement: Placement,
  tier: MetaPromoTier,
  analysisId: string,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          capture(META_PROMO_EVENTS.view, { placement, tier, analysis_id: analysisId });
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, placement, tier, analysisId]);
}

function PromoAction({
  tier,
  analysisId,
  onRun,
  placement,
  compact = false,
}: PromoProps & { placement: Placement; compact?: boolean }) {
  const { t } = useT();
  const cta = metaPromoCta(tier);
  const size = compact ? "sm" : "lg";
  if (cta.kind === "upgrade") {
    return (
      <Link
        href={cta.href}
        onClick={() =>
          capture(META_PROMO_EVENTS.upgradeClick, {
            placement,
            tier,
            target_plan: cta.targetPlan,
            // Anonymous clicks land on sign-up, not checkout — without this
            // they'd read as checkout intent in the funnel.
            destination: cta.href.startsWith("/sign-up") ? "signup" : "checkout",
            analysis_id: analysisId,
          })
        }
      >
        <Button variant="primary" size={size} className={compact ? "" : "w-full sm:w-auto"}>
          <Sparkles className="size-4" />
          {/* An anonymous visitor signs up (free) before they can buy
              anything, so promising them a price on this button would be a
              lie about what the click does. */}
          {tier === "anon"
            ? t("metaPromo.signupCta")
            : t("metaPromo.unlockPro").replace("{price}", String(PLANS.pro.price.month))}
          {!compact && <ArrowRight className="size-4" />}
        </Button>
      </Link>
    );
  }
  return (
    <Button
      type="button"
      variant="primary"
      size={size}
      className={compact ? "" : "w-full sm:w-auto"}
      onClick={() => {
        capture(META_PROMO_EVENTS.runClick, { placement, tier, analysis_id: analysisId });
        onRun();
      }}
    >
      <TrendingUp className="size-4" />
      {t("metaPromo.runCta")}
      <ArrowDown className="size-4" />
    </Button>
  );
}

/** Pro can run the simulator; the Optimizer next to it is Scale. */
function OptimizerUpsell({ analysisId, placement }: { analysisId: string; placement: Placement }) {
  const { t } = useT();
  return (
    <p className="text-xs text-white/50">
      <Crown className="mr-1 inline size-3 text-champagne-300" />
      {t("metaPromo.optimizerUpsell")}{" "}
      <Link
        href={SCALE_CHECKOUT}
        className="text-champagne-300 underline decoration-champagne-400/30 underline-offset-2 hover:text-champagne-200"
        onClick={() =>
          capture(META_PROMO_EVENTS.upgradeClick, {
            placement,
            tier: "pro",
            target_plan: "scale",
            analysis_id: analysisId,
          })
        }
      >
        {t("metaPromo.optimizerCta")}
      </Link>
    </p>
  );
}

function ExampleRows({ dense = false }: { dense?: boolean }) {
  const { t } = useT();
  const rows = dense ? META_PROMO_SAMPLE.filter((s) => s.primary) : META_PROMO_SAMPLE;
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-widest text-white/35">
        {t("metaPromo.sampleLabel")}
      </p>
      <div className={dense ? "" : "grid gap-3 sm:grid-cols-3"}>
        {rows.map((s) => (
          <div
            key={s.key}
            className={`rounded-xl border p-3 ${
              s.primary
                ? "border-champagne-400/25 bg-champagne-400/[0.04]"
                : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              {t(`metaPromo.${s.key}`)}
            </p>
            <p
              className={`mt-1 font-mono tabular-nums text-2xl leading-none ${
                s.primary ? "text-gold-gradient" : "text-white"
              }`}
            >
              {s.roas}
            </p>
            <p className="mt-0.5 text-[10px] text-white/40">{t("metaPromo.roasLabel")}</p>
            {!dense && (
              <div className="mt-2 flex justify-between text-[10px]">
                <span className="text-white/45">{s.spend}</span>
                <span className="font-mono tabular-nums text-success">{s.net}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** (A) The simulator, visible in the first screen of the report. */
export function MetaSimulatorTeaser({ tier, analysisId, onRun }: PromoProps) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useViewOnce(ref, "teaser", tier, analysisId);
  const locked = metaPromoCta(tier).kind === "upgrade";
  return (
    <div ref={ref}>
      <Card className="relative overflow-hidden border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.04] to-signal-600/[0.04] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-champagne-400/10 blur-3xl" />
        <div className="relative space-y-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-champagne-300">
              <TrendingUp className="size-3.5" />
              {t("metaPromo.eyebrow")}
            </p>
            <h3 className="mt-1.5 font-medium text-white">{t("metaPromo.teaserTitle")}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/55">
              {t("metaPromo.teaserBody")}
            </p>
          </div>
          {locked && <ExampleRows />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PromoAction tier={tier} analysisId={analysisId} onRun={onRun} placement="teaser" />
            {/* The billing reassurance belongs next to a button that starts a
                payment. An anonymous visitor's button creates a free account,
                so pairing it with "cancel anytime" would imply a charge. */}
            {locked && tier !== "anon" ? (
              <p className="inline-flex items-center gap-1 text-[11px] text-white/40">
                <Shield className="size-3" />
                {t("metaPromo.cancelAnytime")}
              </p>
            ) : tier === "pro" ? (
              <OptimizerUpsell analysisId={analysisId} placement="teaser" />
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

/** (C) Persistent side rail — wide screens only; the report places it. */
export function MetaPromoRail({ tier, analysisId, onRun }: PromoProps) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useViewOnce(ref, "rail", tier, analysisId);
  const locked = metaPromoCta(tier).kind === "upgrade";
  return (
    <div
      ref={ref}
      className="space-y-3 rounded-2xl border border-champagne-400/15 bg-gradient-to-b from-champagne-400/[0.05] to-transparent p-4"
    >
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-champagne-300">
        <TrendingUp className="size-3" />
        {t("metaPromo.eyebrow")}
      </p>
      <p className="text-sm font-medium text-white">{t("metaPromo.railTitle")}</p>
      {locked && <ExampleRows dense />}
      <PromoAction tier={tier} analysisId={analysisId} onRun={onRun} placement="rail" compact />
      {tier === "pro" && <OptimizerUpsell analysisId={analysisId} placement="rail" />}
    </div>
  );
}

/**
 * (C) Below the rail's breakpoint it collapses to a bar pinned to the bottom.
 * `hideAt` must match where the caller shows the rail, so exactly one of the
 * two is on screen at any width.
 */
export function MetaPromoMobileBar({
  tier,
  analysisId,
  onRun,
  hideAt,
}: PromoProps & { hideAt: "xl" | "2xl" }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useViewOnce(ref, "mobile_bar", tier, analysisId);
  const locked = metaPromoCta(tier).kind === "upgrade";
  return (
    <div
      ref={ref}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#0a0a0f]/90 px-4 py-3 pr-20 backdrop-blur ${
        hideAt === "xl" ? "xl:hidden" : "2xl:hidden"
      }`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-white/70">
          <TrendingUp className="mr-1.5 inline size-3.5 text-champagne-300" />
          {locked ? t("metaPromo.mobileLocked") : t("metaPromo.mobileRun")}
        </p>
        <PromoAction tier={tier} analysisId={analysisId} onRun={onRun} placement="mobile_bar" compact />
      </div>
    </div>
  );
}
