"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TrendingUp, Sparkles, RefreshCw, RotateCw, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimulatorEmpty } from "./simulator-empty";
import { SimulatorScenarioCard } from "./simulator-scenario-card";
import type { SimulationScenario } from "@/lib/supabase/types";

/** Monthly Meta-run quota for this viewer (null limit = unlimited / Scale). */
export type MetaQuota = { limit: number | null; used: number };

/**
 * Top-level wrapper for the Meta Campaign Scenario Modeler section.
 *
 * State machine:
 *   - no simulation row yet → SimulatorEmpty (form)
 *   - queued/running       → polling indicator
 *   - succeeded            → 3 scenario cards + "Re-run with new inputs" CTA
 *   - failed (all 3)       → error card with re-submit (SimulatorEmpty with previousError)
 *
 * Polling is the same approach as AnalysisView's polling of /api/analyses/[id].
 */

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

export function MetaCampaignSimulator({
  analysisId,
  initial,
  quota,
}: {
  analysisId: string;
  initial: Simulation | null;
  quota?: MetaQuota;
}) {
  // Current simulation we're tracking. null = no simulation yet (show form).
  const [sim, setSim] = useState<Simulation | null>(initial);
  // Force-render the form even if a successful sim exists ("Re-run" button)
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  // ── ALL hooks must run before any conditional return (Rules of Hooks) ──
  const statusRef = useRef(sim?.status ?? null);
  statusRef.current = sim?.status ?? null;

  useEffect(() => {
    if (!sim) return;
    if (sim.status !== "queued" && sim.status !== "running") return;

    let alive = true;
    const tick = async () => {
      if (
        statusRef.current !== "queued" &&
        statusRef.current !== "running"
      ) {
        return;
      }
      try {
        const res = await fetch(`/api/meta-simulations/${sim.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as Simulation;
        if (!alive) return;
        setSim(next);
        // On completion, refresh the server components so the Ads Optimizer
        // (computed as part of this run for Pro) shows up in the report.
        if (next.status === "succeeded" || next.status === "failed") {
          router.refresh();
        }
      } catch {
        /* network blip — try again next tick */
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sim?.id, sim?.status, router]);

  // Finite monthly limit = Pro (Scale passes limit=null → unlimited).
  const finiteLimit =
    quota && quota.limit !== null ? (quota.limit as number) : null;
  const hasResults = sim?.status === "succeeded";
  // Once the row exists we count it as consumed even before `used` reflects it
  // server-side (the initial run is optimistic-queued in this component).
  const usedNow = quota
    ? Math.max(quota.used, sim ? 1 : 0)
    : 0;
  const exhausted = finiteLimit !== null && usedNow >= finiteLimit;

  // Pro who has spent this month's run and has nothing to show → upsell only.
  if (exhausted && !hasResults) {
    return <MetaQuotaUpsell used={usedNow} limit={finiteLimit as number} />;
  }

  // CASE 1: no simulation yet OR user clicked "Re-run with new inputs"
  if (!sim || showForm) {
    return (
      <div className="space-y-3">
        {finiteLimit !== null && (
          <MetaQuotaCounter used={usedNow} limit={finiteLimit} />
        )}
        <SimulatorEmpty
          analysisId={analysisId}
          previousError={sim?.status === "failed" ? sim.error : null}
          planLabel={finiteLimit !== null ? "Pro · 1 / mo" : "Scale plan"}
          onQueued={(simulationId) => {
          // optimistic state: empty scenarios + queued status
          setSim({
            id: simulationId,
            analysis_id: analysisId,
            aov_usd: 0,
            daily_budget_usd: 0,
            product_margin_pct: null,
            notes: null,
            conservative: null,
            balanced: null,
            aggressive: null,
            status: "queued",
            error: null,
            started_at: null,
            finished_at: null,
            created_at: new Date().toISOString(),
          });
          setShowForm(false);
        }}
        />
      </div>
    );
  }

  // CASE 2: in flight
  if (sim.status === "queued" || sim.status === "running") {
    return <SimulatorRunning />;
  }

  // CASE 3: all three failed
  const allFailed =
    !sim.conservative && !sim.balanced && !sim.aggressive;
  if (sim.status === "failed" || allFailed) {
    return (
      <SimulatorEmpty
        analysisId={analysisId}
        previousError={sim.error ?? "The modeler couldn't produce a valid scenario."}
        onQueued={(simulationId) => {
          setSim({
            ...sim,
            id: simulationId,
            conservative: null,
            balanced: null,
            aggressive: null,
            status: "queued",
            error: null,
            started_at: null,
            finished_at: null,
            created_at: new Date().toISOString(),
          });
        }}
      />
    );
  }

  // CASE 4: success (possibly partial — one or two scenarios may be missing)
  const scenarios: SimulationScenario[] = [
    sim.conservative,
    sim.balanced,
    sim.aggressive,
  ].filter((s): s is SimulationScenario => s !== null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-champagne-400" />
            <h3 className="font-medium text-white">Campaign Scenario Modeler</h3>
            {finiteLimit !== null ? (
              <Badge variant="default">
                {usedNow} of {finiteLimit} this month
              </Badge>
            ) : (
              <Badge variant="gold">
                <Sparkles className="size-3" />
                Scale plan
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            7-day Meta Ads projection · AOV ${sim.aov_usd} · ${sim.daily_budget_usd}/day budget
          </p>
        </div>
        {/* Re-run is free for Scale (unlimited). For Pro, once the monthly
            run is spent the button becomes a Scale upsell instead. */}
        {exhausted ? (
          <Button asChild variant="primary" className="shrink-0">
            <Link href="/app/checkout?plan=scale&interval=month">
              <Sparkles className="size-3.5" />
              Unlimited on Scale
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setShowForm(true)}
            className="shrink-0"
          >
            <RotateCw className="size-3.5" />
            Re-run
          </Button>
        )}
      </header>

      {/* Pro upsell bar under a consumed projection — the result stays visible
          (never yanked away); this just points to Scale for more. */}
      {exhausted && (
        <div className="flex flex-col gap-2 rounded-xl border border-signal-500/20 bg-signal-600/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/70">
            You&apos;ve used your Meta projection for this month.{" "}
            <span className="text-signal-200">
              Scale includes unlimited projections.
            </span>
          </p>
          <Link
            href="/app/checkout?plan=scale&interval=month"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-signal-200 hover:text-signal-100"
          >
            Upgrade to Scale
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}

      {sim.error && (
        <Card className="p-3 border-warning/20 bg-warning/[0.04]">
          <p className="text-xs text-warning">
            Partial result —{" "}
            <span className="text-white/70">{sim.error}</span>
          </p>
        </Card>
      )}

      {/* 3 comparable cards side-by-side on desktop; horizontal snap carousel
          on mobile (Fase 2 P0-1) — the page never scrolls sideways, only this
          track does. */}
      <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
        {scenarios.map((s, i) => (
          <div
            key={s.variant}
            className="min-w-[85%] shrink-0 snap-center sm:min-w-[65%] lg:min-w-0 lg:shrink"
          >
            <SimulatorScenarioCard scenario={s} index={i} />
          </div>
        ))}
      </div>

      <p className="text-[11px] text-white/40 max-w-3xl">
        These are AI estimates calibrated on your audit score, niche, AOV and budget —
        not predictions. Real campaigns swing on creative, attribution and platform
        variance. Use the recommendations as starting points for your own testing.
      </p>
    </motion.section>
  );
}

/** Pro counter chip above the form: "Projection 1 of 1 this month". */
function MetaQuotaCounter({ used, limit }: { used: number; limit: number }) {
  const remaining = Math.max(0, limit - used);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-champagne-400/15 bg-champagne-400/[0.04] px-4 py-2.5">
      <Sparkles className="size-3.5 text-champagne-300" />
      <p className="text-xs text-white/70">
        <span className="font-medium text-white">
          {remaining} of {limit}
        </span>{" "}
        Meta {limit === 1 ? "projection" : "projections"} left this month on
        Pro.{" "}
        <Link
          href="/app/checkout?plan=scale&interval=month"
          className="text-signal-200 hover:text-signal-100"
        >
          Scale = unlimited →
        </Link>
      </p>
    </div>
  );
}

/**
 * Shown to a Pro user who has spent this month's Meta run and has no result
 * to display (e.g. the run failed). Honest counter + Scale upsell — no fake
 * urgency, no result promised.
 */
function MetaQuotaUpsell({ used, limit }: { used: number; limit: number }) {
  return (
    <Card className="relative overflow-hidden p-6 md:p-7 border-signal-500/20 bg-gradient-to-br from-signal-600/[0.06] to-champagne-400/[0.04]">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-signal-600/12 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-signal-300" />
          <h3 className="font-medium text-white">Campaign Scenario Modeler</h3>
          <Badge variant="default">
            {used} of {limit} this month
          </Badge>
        </div>
        <p className="mt-2 max-w-xl text-sm text-white/60 leading-relaxed">
          You&apos;ve used your Meta campaign projection for this month. Your
          quota resets at the start of your next billing period — or upgrade to
          Scale for unlimited 7-day projections, the Meta Ads optimizer and the
          REST API.
        </p>
        <Link href="/app/checkout?plan=scale&interval=month" className="mt-4 inline-block">
          <Button variant="primary">
            <Sparkles className="size-4" />
            Upgrade to Scale
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/** Running state — shown while Inngest is fanning out the 3 parallel calls. */
function SimulatorRunning() {
  return (
    <Card className="relative overflow-hidden p-6 md:p-7 border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.04] to-signal-600/[0.04]">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl animate-pulse" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-champagne-400" />
          <h3 className="font-medium">Campaign Scenario Modeler</h3>
          <Badge variant="ai">
            <RefreshCw className="size-3 animate-spin" />
            Running
          </Badge>
        </div>
        <p className="mt-1.5 text-sm text-white/55">
          Projecting 3 scenarios in parallel — conservative, balanced, aggressive.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {(["Conservative", "Balanced", "Aggressive"] as const).map((label, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: i * 0.25,
                ease: "easeInOut",
              }}
              className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
            >
              <div className="h-2 w-16 rounded bg-white/10" />
              <div className="mt-3 h-6 w-12 rounded bg-white/10" />
              <div className="mt-2 h-2 w-full rounded bg-white/[0.06]" />
              <div className="mt-1.5 h-2 w-3/4 rounded bg-white/[0.06]" />
              <p className="mt-3 text-[10px] uppercase tracking-widest text-white/40">
                {label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Card>
  );
}
