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
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConversionGauges } from "./conversion-gauges";
import { CategoryRadar } from "./category-radar";
import { AnnotationsOverlay } from "./annotations-overlay";
import { PersonaAside } from "./persona-aside";
import { TopFixes } from "./top-fixes";
// RewritePanel removed from v2.1 — Auto-Rewrite is no longer shown in the
// analyzer; only Meta Ads Optimizer lives as the Scale-tier extra.
import { AnalyzingState } from "./analyzing-state";
import { PublishCallout } from "@/components/community/publish-callout";
import { MetaAdsOptimizer } from "./meta-ads-optimizer";
import { MetaCampaignSimulator } from "./meta-campaign-simulator";
import { NichePositionBar } from "./niche-position-bar";
import { StrengthsIssuesMap } from "./strengths-issues-map";
import { LockedMetaAdsPreview } from "./scale-locked-preview";
import { FreeLockedCure } from "./free-locked-cure";
import { FreeMetaPanel } from "./free-meta-panel";
import { ShareButton } from "./share-button";
import type {
  AnalysisResult,
  RewriteResult,
  SimulationScenario,
} from "@/lib/supabase/types";

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
}: {
  initial: Analysis;
  viewer: ViewerCtx;
  initialSimulation?: Simulation | null;
}) {
  const [data, setData] = useState<Analysis>(initial);
  const router = useRouter();

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
              Fase 2 — Meta-first report ordering:
                1. Score + annotated screenshot (the free hook)
                2. META BLOCK — the protagonist (Free: modelable panel;
                   Paid: the Ads Optimizer + Campaign Scenario Modeler)
                3. Prioritized fixes
                4. Buyer persona (degraded to a support card)
                5. Everything else (niche position, strengths, radar, Library)
            */}

            {/* 1 — Score + gauges (the hook) */}
            <div className="grid lg:grid-cols-[1fr_360px] gap-6">
              <ScoreCard result={data.result} />
              <ConversionGauges scenarios={data.result.scenarios} />
            </div>

            {/*
              1b — Annotated screenshot, still part of the free hook.
              NEVER fall back to mshots client-side: the server-side capture
              already exhausted ScreenshotOne → Microlink → mshots with
              placeholder detection. An empty string shows the overlay's
              clean "screenshot unavailable" state.
            */}
            <AnnotationsOverlay
              imageUrl={data.screenshot_url ?? ""}
              annotations={data.result.annotations}
            />

            {/*
              2 — THE META BLOCK. Second position, full width, impossible to
              scroll past. Free users get the "modelable" panel (a real,
              score-derived ROAS range + a blurred preview of the block);
              Pro/Scale get the live block: Ads Optimizer targets (Scale) plus
              the Campaign Scenario Modeler (Pro 1/mo, Scale unlimited).
            */}
            {viewer.isPaid ? (
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-champagne-400/10 ring-1 ring-champagne-400/20">
                    <TrendingUp className="size-4 text-champagne-300" />
                  </div>
                  <div>
                    <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-white">
                      Your store, translated into Meta Ads numbers
                    </h2>
                    <p className="text-sm text-white/50">
                      What this audit means when you put spend behind it.
                    </p>
                  </div>
                </div>

                {/* Always-visible estimate disclaimer — part of the block,
                    legible, not fine print in a footer. */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-xs text-white/55">
                  Estimates based on your audit, AOV and budget. Not guarantees
                  of results.
                </div>

                {/* Sub-block A — Ads Optimizer targets (Scale). Pro sees the
                    locked preview with a Scale upsell. */}
                {viewer.isScale && data.meta_ads != null && (
                  <MetaAdsOptimizer meta={data.meta_ads as never} />
                )}
                {viewer.isScale && data.meta_ads == null && <MetaAdsPending />}
                {!viewer.isScale && <LockedMetaAdsPreview />}

                {/* Sub-block B — Campaign Scenario Modeler (Pro 1/mo, Scale ∞) */}
                <MetaCampaignSimulator
                  analysisId={data.id}
                  initial={initialSimulation ?? null}
                  quota={{ limit: viewer.metaLimit, used: viewer.metaUsed }}
                />
              </section>
            ) : (
              <FreeMetaPanel score={data.result.score} niche={niche} />
            )}

            {/*
              3 — Prioritized fixes (punch-list). Paid users get every fix;
              Free users get fix #1 unlocked + the rest title-visible/locked
              with a counter + Pro CTA (P1-6).
            */}
            <TopFixes
              fixes={data.result.top_fixes}
              unlockedCount={viewer.isPaid ? undefined : 1}
            />

            {/*
              4 — Buyer persona, DEGRADED to a support card (Fase 2 P1-4).
              Still present (a landing-comparison differentiator and the most
              shareable line the product makes) but no longer a full-width
              section competing with the Meta block. On Free it's locked.
            */}
            {viewer.isPaid ? (
              <PersonaAside
                response={data.result.buyer_persona_response}
                metaLinked={viewer.isScale && data.meta_ads != null}
              />
            ) : (
              <FreeLockedCure
                title="Buyer-persona reaction"
                tagline="Hear exactly how your target buyer reacts to your store — what makes them hesitate, and whether they'd buy."
              >
                <PersonaAside response={data.result.buyer_persona_response} />
              </FreeLockedCure>
            )}

            {/* 5 — Everything else: strategic view + detail + Library bridge */}
            <div className="grid lg:grid-cols-2 gap-6">
              <NichePositionBar score={data.result.score} />
              <StrengthsIssuesMap scores={data.result.category_scores} />
            </div>

            <CategoryRadar scores={data.result.category_scores} />

            {/*
              Analyzer → Library bridge. "So who's beating me, and what do they
              do differently?" — one hop to the Library answers it. The reverse
              link lives in the Library header, so the two pillars are always
              one click apart in both directions.
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

function ScoreCard({ result }: { result: AnalysisResult }) {
  // Gemini Flash-Lite sometimes returns score as 0..1 instead of 0..100.
  // If <= 1, assume normalized and rescale.
  const rawScore = result.score ?? 0;
  const score = Math.round(rawScore > 1 ? rawScore : rawScore * 100);
  const tier =
    score >= 90
      ? "World-class"
      : score >= 75
        ? "Strong"
        : score >= 55
          ? "Average"
          : score >= 35
            ? "Below avg."
            : "Broken";

  return (
    <Card className="relative overflow-hidden p-6 md:p-8">
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-champagne-400/15 blur-3xl" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">
            Overall score
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-7xl tnum text-gold-gradient leading-none">
              {score}
            </span>
            <span className="text-xl text-white/40">/ 100</span>
          </div>
          <Badge variant="gold" className="mt-3">
            {tier}
          </Badge>
        </div>
      </div>
      <p className="mt-6 text-sm text-white/65 leading-relaxed">
        {result.summary}
      </p>
    </Card>
  );
}
