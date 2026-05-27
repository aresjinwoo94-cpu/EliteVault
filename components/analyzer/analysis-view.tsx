"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, RefreshCw, Sparkles } from "lucide-react";
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
import { MetaAdsOptimizer } from "./meta-ads-optimizer";
import { MetaCampaignSimulator } from "./meta-campaign-simulator";
import { NichePositionBar } from "./niche-position-bar";
import { StrengthsIssuesMap } from "./strengths-issues-map";
import {
  LockedMetaAdsPreview,
  LockedSimulatorPreview,
} from "./scale-locked-preview";
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
};

interface ViewerCtx {
  canPublish: boolean;
  publishedSlug: string | null;
  fullName: string | null;
  isScale: boolean;
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
        <Badge
          variant={
            isDone ? "success" : isFailed ? "danger" : "ai"
          }
          className="shrink-0"
        >
          {isWorking && <RefreshCw className="size-3 animate-spin" />}
          {isDone && <Sparkles className="size-3" />}
          {data.status}
        </Badge>
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
          <AnalyzingState status={data.status} startedAt={data.started_at} />
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
            {/* Top stats row */}
            <div className="grid lg:grid-cols-[1fr_360px] gap-6">
              <ScoreCard result={data.result} />
              <ConversionGauges scenarios={data.result.scenarios} />
            </div>

            {/*
              v3.3.1 — Executive deck section. Two consulting-style
              visualizations that summarize the audit at a glance:
                • Where you stand (niche position bar)
                • Strengths vs issues (3-bucket category split)
              Sits between the score row and the detailed audit body, so
              the operator gets the strategic view BEFORE diving into the
              tactical findings. (Impact/Effort matrix was removed per
              user feedback — TopFixes list already covers prioritisation.)
            */}
            <div className="grid lg:grid-cols-2 gap-6">
              <NichePositionBar score={data.result.score} />
              <StrengthsIssuesMap scores={data.result.category_scores} />
            </div>

            {/*
              Two-column body. LEFT column is the "primary content" stream —
              screenshot → persona reaction → Meta Ads Optimizer (Scale).
              RIGHT column is the dense side widgets — radar + top fixes.
              On mobile both stack vertically.
            */}
            <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
              <div className="space-y-6 min-w-0">
                {/*
                  NEVER fall back to mshots client-side here. The server-side
                  capture already exhausted ScreenshotOne → Microlink → mshots
                  with placeholder detection; if we got here without a stored
                  screenshot_url it means none of them succeeded. Falling back
                  to mshots in the browser just renders the "Generating
                  Preview..." placeholder, which is what users were seeing
                  before this fix. Passing an empty string makes the overlay
                  show its clean "screenshot unavailable" state.
                */}
                <AnnotationsOverlay
                  imageUrl={data.screenshot_url ?? ""}
                  annotations={data.result.annotations}
                />
                <PersonaResponse
                  response={data.result.buyer_persona_response}
                />
                {viewer.isScale && data.meta_ads != null && (
                  <MetaAdsOptimizer meta={data.meta_ads as never} />
                )}
                {viewer.isScale && data.meta_ads == null && (
                  <MetaAdsPending />
                )}
                {/*
                  v3.9.2 — Pro users see a locked preview of the Meta Ads
                  Optimizer with a Scale upgrade CTA. Drives the Pro→Scale
                  upgrade by making the feature tangible instead of just
                  a checkbox on the pricing page.
                */}
                {!viewer.isScale && <LockedMetaAdsPreview />}
              </div>

              <div className="space-y-6 min-w-0">
                <CategoryRadar scores={data.result.category_scores} />
                <TopFixes fixes={data.result.top_fixes} />
              </div>
            </div>

            {/*
              v3.0 — Meta Campaign Scenario Modeler. Scale only, succeeded only.
              Sits below the main audit body as its own dedicated section,
              not in either column — the 3-card grid needs the full width.
              The simulator manages its own state machine (empty → running
              → results) internally; we just pass the initial DB row (or null).
            */}
            {viewer.isScale && (
              <MetaCampaignSimulator
                analysisId={data.id}
                initial={initialSimulation ?? null}
              />
            )}
            {/*
              v3.9.2 — Pro users see a locked preview of the Campaign
              Scenario Modeler. Same upsell pattern as Meta Ads above.
            */}
            {!viewer.isScale && <LockedSimulatorPreview />}
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
    <Card className="relative overflow-hidden p-6 border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.03] to-violet-600/[0.03]">
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
            <span className="font-serif text-7xl tnum text-gold-gradient leading-none">
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
