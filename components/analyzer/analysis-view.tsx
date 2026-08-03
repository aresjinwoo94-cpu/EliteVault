"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Library as LibraryIcon,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConversionGauges } from "./conversion-gauges";
import { CategoryRadar } from "./category-radar";
import { AnnotationsOverlay } from "./annotations-overlay";
import { PersonaResponse } from "./persona-response";
import { TopFixes } from "./top-fixes";
// RewritePanel removed from v2.1 — Auto-Rewrite is no longer shown in the
// analyzer; only Meta Ads Optimizer lives as the Scale-tier extra.
import { AnalyzingState } from "./analyzing-state";
import { PublishCallout } from "@/components/community/publish-callout";
import { ReviewPrompt } from "@/components/reviews/review-prompt";
import { MetaAdsOptimizer } from "./meta-ads-optimizer";
import { MetaCampaignSimulator } from "./meta-campaign-simulator";
// NichePositionBar ("Where you stand") and StrengthsIssuesMap ("Strengths vs
// issues") were removed in the tech-fixes §5 de-duplication: the Growth Map
// already shows the store's position + score, and the CategoryRadar is the
// single category-scores view. Their files remain for reuse elsewhere.
import { FreeLockedCure } from "./free-locked-cure";
import { FreeMetaPanel } from "./free-meta-panel";
import { NicheWinners } from "./niche-winners";
import { AdReadinessCard } from "./ad-readiness";
import { AnalyzerPaywall } from "./analyzer-paywall";
import { ShareButton } from "./share-button";
import { GrowthMap } from "./growth-map/growth-map";
import type {
  AnalysisResult,
  RewriteResult,
  SimulationScenario,
} from "@/lib/supabase/types";
import type { NicheWinner } from "@/lib/library/niche-winners";

/** Serializable payload for the "Winners in your niche" module (Change 3). */
interface NicheWinnersData {
  nicheLabel: string;
  locked: boolean;
  winners: NicheWinner[];
  lockedCount: number;
  /** "global" when the store's niche couldn't be classified — see the card. */
  scope?: "niche" | "global";
}

type Simulation = {
  id: string;
  analysis_id: string;
  aov_usd: number;
  daily_budget_usd: number;
  product_margin_pct: number | null;
  notes: string | null;
  conservative: SimulationScenario | null;
  balanced: SimulationScenario | null;
  aggressive: SimulationScenario | null;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type Analysis = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "refunded";
  url: string | null;
  screenshot_url: string | null;
  result: AnalysisResult | null;
  rewrite: RewriteResult | null;
  meta_ads?: unknown;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  is_published?: boolean;
  share_slug?: string | null;
  preview_score?: number | null;
  preview_summary?: string | null;
};

interface ViewerCtx {
  canPublish: boolean;
  publishedSlug: string | null;
  fullName: string | null;
  isScale: boolean;
  /**
   * P0.2 — true for Pro/Scale. Free users see the diagnosis (score +
   * annotated screenshot) but the "cure" (prioritized fixes + persona
   * simulation) is rendered blurred behind a Pro upgrade CTA.
   */
  isPaid: boolean;
  /**
   * P1-7 — whether this plan can run the Meta Campaign Scenario Modeler.
   * Pro (1/mo) and Scale (unlimited) can; Free cannot. `metaLimit` is the
   * monthly cap (null = unlimited, Scale) and `metaUsed` is the count used
   * this billing period — together they drive the "1 of 1 this month"
   * counter and the Scale upsell once a Pro user consumes their run.
   */
  canRunMeta: boolean;
  metaLimit: number | null;
  metaUsed: number;
}

export function AnalysisView({
  initial,
  viewer,
  initialSimulation,
  nicheWinners,
}: {
  initial: Analysis;
  viewer: ViewerCtx;
  initialSimulation?: Simulation | null;
  nicheWinners?: NicheWinnersData | null;
}) {
  const [data, setData] = useState<Analysis>(initial);
  const router = useRouter();

  // Fase 2 — pick up meta_ads when a server re-render (router.refresh() after a
  // Pro Meta run) delivers it. The Ads Optimizer is computed asynchronously as
  // part of the modeler run, so the initial client `data` has meta_ads=null;
  // this syncs it in without disturbing the polled status.
  useEffect(() => {
    if (initial.meta_ads != null) {
      setData((prev) =>
        prev.meta_ads == null ? { ...prev, meta_ads: initial.meta_ads } : prev,
      );
    }
  }, [initial.meta_ads]);

  // Track liveness across polls without re-creating the interval.
  // We keep the interval running on a stable [data.id] dep and read the
  // current status from a ref — this avoids React closure pitfalls.
  const statusRef = useRef(data.status);
  statusRef.current = data.status;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (
        statusRef.current !== "queued" &&
        statusRef.current !== "running"
      ) {
        return;
      }
      try {
        const res = await fetch(`/api/analyses/${data.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as Analysis;
        if (!alive) return;
        const wasRunning =
          statusRef.current === "queued" || statusRef.current === "running";
        const becameTerminal =
          next.status !== "queued" && next.status !== "running";
        setData(next);
        if (wasRunning && becameTerminal) {
          // re-fetch server data (credit counts, sidebar) when job finishes
          router.refresh();
        }
      } catch {
        /* network blip — try again next tick */
      }
    };
    // immediate first tick + interval
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [data.id]);

  const isDone = data.status === "succeeded";
  const isWorking = data.status === "queued" || data.status === "running";
  const isFailed = data.status === "failed" || data.status === "refunded";

  // Niche for the free ROAS-range panel — inferred from the domain the same
  // way the analyzer pipeline does (host's first label). Safe on null URLs
  // (uploaded screenshots) → "ecommerce", which maps to the default band.
  const niche = (() => {
    try {
      return data.url
        ? new URL(data.url).hostname.replace(/^www\./, "").split(".")[0]
        : "ecommerce";
    } catch {
      return "ecommerce";
    }
  })();

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/app/analyzer"
            className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to Analyzer
          </Link>
          <h1 className="mt-2 font-serif text-3xl md:text-4xl tracking-tight truncate">
            {data.url ?? "Uploaded screenshot"}
          </h1>
          <p className="text-xs text-white/40 mt-1">
            {new Date(data.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* P0.3 — share the public, read-only audit (any plan). */}
          {isDone && (
            <ShareButton
              analysisId={data.id}
              initialSlug={data.share_slug ?? null}
            />
          )}
          <Badge
            variant={isDone ? "success" : isFailed ? "danger" : "ai"}
          >
            {isWorking && <RefreshCw className="size-3 animate-spin" />}
            {isDone && <Sparkles className="size-3" />}
            {data.status}
          </Badge>
        </div>
      </header>

      {/* Prominent Publish-to-Community callout (Pro/Scale only, succeeded only) */}
      {isDone && viewer.canPublish && (
        <PublishCallout
          analysisId={data.id}
          defaultDisplayName={viewer.fullName}
          isPublished={!!data.is_published}
          publishedSlug={viewer.publishedSlug}
        />
      )}

      {/* Post-audit satisfaction moment — subtle, dismissible "leave a review"
          nudge. Shows only after the audit succeeds. */}
      {isDone && <ReviewPrompt />}

      {/* No AnimatePresence around isWorking — infinite child animations in
          AnalyzingState would block the exit transition and stall the UI
          when status flips to succeeded. Simple conditional render instead. */}
      {isWorking && (
        <motion.div
          key="working"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <AnalyzingState
            status={data.status}
            startedAt={data.started_at}
            previewScore={data.preview_score ?? null}
            previewSummary={data.preview_summary ?? null}
          />
        </motion.div>
      )}

      {isFailed && (
        <motion.div
          key="failed"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
            <Card className="relative overflow-hidden border-destructive/30 bg-destructive/[0.03] p-8 md:p-10">
              <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-destructive/15 blur-3xl" />

              <div className="relative flex flex-col items-center text-center max-w-xl mx-auto">
                <div className="flex size-12 items-center justify-center rounded-full bg-destructive/15 ring-1 ring-destructive/30">
                  <RefreshCw className="size-5 text-destructive" />
                </div>

                <h2 className="mt-5 font-serif text-2xl md:text-3xl tracking-tight">
                  {data.status === "refunded"
                    ? "We couldn't complete this analysis"
                    : "Something went wrong"}
                </h2>

                {data.status === "refunded" && (
                  <p className="mt-2 text-sm text-white/55">
                    Your credit was refunded automatically — no charge.
                  </p>
                )}

                {data.error && (
                  <div className="mt-6 w-full rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left">
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
                      What happened
                    </p>
                    <p className="text-sm text-white/80 leading-relaxed">
                      {data.error}
                    </p>
                  </div>
                )}

                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <Link href="/app/analyzer">
                    <Button variant="primary">
                      Try again
                    </Button>
                  </Link>
                  <Link href="/app">
                    <Button variant="outline">
                      Back to dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

      {isDone && data.result && (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
            {/*
              THE GROWTH MAP — hero, at the very top of the result (spec §9).
              Additive: it reads `data.result` (already computed) and never
              touches the analyzer's scoring or the sections below it. Free sees
              the map + their rank + the current-node diagnosis; the escape
              route (nodes ahead) is gated to Pro.
            */}
            <GrowthMap
              analysisId={data.id}
              result={data.result}
              url={data.url}
              isPaid={viewer.isPaid}
            />

            {/*
              Report layout — de-duplicated + re-ordered (tech-fixes §5).

              The Growth Map above is the hero: it already carries the score, the
              niche, the store's position and the per-node diagnosis. So the old
              standalone ScoreCard, the "Where you stand" slider and the
              "Strengths vs issues" bars are gone (they repeated the map and the
              category radar). The conversion-scenario gauges moved to the very
              end as the Meta-readiness teaser rather than sitting loose up top.

              New order puts the differentiators first:
                1. Growth Map (above)                → the hook
                2. Top fixes + Winners in your niche → most actionable / engaging
                3. Annotated audit + Category radar  → the visual diagnosis, once
                4. Buyer-persona response
                5. Library bridge
                6. Meta-readiness teaser + tools (conversion gauges live here)
            */}

            {/*
              2 — Top fixes (the single most actionable block) paired with the
              Winners module. Two stacks of similar height, so the columns
              balance. If the Winners module is hidden, fixes go full width.
            */}
            {(() => {
              const winnersCard = nicheWinners ? (
                <NicheWinners
                  nicheLabel={nicheWinners.nicheLabel}
                  winners={nicheWinners.winners}
                  locked={nicheWinners.locked}
                  lockedCount={nicheWinners.lockedCount}
                  scope={nicheWinners.scope ?? "niche"}
                />
              ) : null;
              const topFixes = (
                <TopFixes
                  fixes={data.result.top_fixes}
                  unlockedCount={viewer.isPaid ? undefined : 1}
                />
              );
              return winnersCard ? (
                <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
                  <div className="min-w-0">{topFixes}</div>
                  <div className="min-w-0">{winnersCard}</div>
                </div>
              ) : (
                topFixes
              );
            })()}

            {/*
              3 — The visual diagnosis, shown ONCE. LEFT: annotated screenshot.
              RIGHT: category breakdown (radar). NEVER fall back to mshots
              client-side: an empty screenshot_url shows the overlay's clean
              unavailable state.
            */}
            <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
              <div className="min-w-0">
                <AnnotationsOverlay
                  imageUrl={data.screenshot_url ?? ""}
                  annotations={data.result.annotations}
                />
              </div>
              <div className="min-w-0">
                <CategoryRadar scores={data.result.category_scores} />
              </div>
            </div>

            {/*
              4 — Buyer-persona reaction. Paid users see it; Free sees it blurred
              behind a Pro upgrade CTA (their real computed response).
            */}
            {viewer.isPaid ? (
              <PersonaResponse response={data.result.buyer_persona_response} />
            ) : (
              <FreeLockedCure
                title="Buyer-persona simulation"
                tagline="Hear exactly how your target buyer reacts to your store — what makes them hesitate, and whether they'd buy."
              >
                <PersonaResponse
                  response={data.result.buyer_persona_response}
                />
              </FreeLockedCure>
            )}

            {/*
              5 — Analyzer → Library bridge. "So who's beating me, and what do
              they do differently?" — one hop to the Library answers it.
            */}
            <Link
              href="/app/library"
              className="group flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 transition-colors hover:border-signal-500/25 hover:bg-white/[0.03]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                  <LibraryIcon className="size-4 text-signal-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white/85">
                    See the stores already converting in your niche
                  </p>
                  <p className="text-xs text-white/45">
                    Study what the winners do differently — then copy it.
                  </p>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-signal-300">
                Open Library
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>

            {/*
              6 — Meta-readiness teaser + tools, AT THE END (tech-fixes §5 pt 5).
              Ad-readiness reframes the score around paid traffic; the conversion
              gauges are the "estimated conversion rate" teaser (paid) / the
              modelable ROAS panel (free). The live Meta tools follow for plans
              that can run them.
            */}
            <div className="space-y-6">
              <AdReadinessCard data={data.result.ad_readiness} />
              {viewer.isPaid ? (
                <ConversionGauges scenarios={data.result.scenarios} />
              ) : (
                <FreeMetaPanel score={data.result.score} niche={niche} />
              )}
              {viewer.canRunMeta && (
                <>
                  {data.meta_ads != null ? (
                    <MetaAdsOptimizer meta={data.meta_ads as never} />
                  ) : viewer.isScale ? (
                    <MetaAdsPending />
                  ) : null}
                  <MetaCampaignSimulator
                    analysisId={data.id}
                    initial={initialSimulation ?? null}
                    quota={{ limit: viewer.metaLimit, used: viewer.metaUsed }}
                  />
                </>
              )}
            </div>

            {/*
              Thin upgrade-modal layer (Tarea 3) — ONLY for free viewers, and
              placed at the very end so its scroll sentinel sits just after the
              "What this means for your ads" block. It complements (never
              duplicates) the inline locks above. Hidden entirely once there's
              nothing left to unlock.
            */}
            {!viewer.isPaid &&
              (() => {
                const lockedFixes = Math.max(
                  0,
                  (data.result.top_fixes?.length ?? 0) - 1,
                );
                if (lockedFixes < 1) return null;
                return (
                  <AnalyzerPaywall
                    analysisId={data.id}
                    score={data.result.score}
                    lockedFixes={lockedFixes}
                    niche={niche}
                  />
                );
              })()}
        </motion.div>
      )}
    </div>
  );
}

/**
 * Shown for Scale users on audits that were created BEFORE the Meta Ads
 * Optimizer agent went live (their row has meta_ads = null). Friendly
 * "this'll appear on new audits" message — not an error.
 */
function MetaAdsPending() {
  return (
    <Card className="relative overflow-hidden p-6 border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.03] to-signal-600/[0.03]">
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-champagne-400/10 blur-3xl" />
      <div className="relative flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-champagne-400/10 ring-1 ring-champagne-400/20">
          <Sparkles className="size-4 text-champagne-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-white">Meta Ads Optimizer</h3>
          <p className="mt-1 text-sm text-white/55 leading-relaxed">
            CPC, CPM, CTR & ROAS targets calibrated to this audit aren't
            available on this older analysis. Run a new analysis to see the
            full Scale-tier recommendations panel.
          </p>
        </div>
      </div>
    </Card>
  );
}

