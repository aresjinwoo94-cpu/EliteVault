"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Sparkles, RefreshCw, RotateCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimulatorEmpty } from "./simulator-empty";
import { SimulatorScenarioCard } from "./simulator-scenario-card";
import type { SimulationScenario } from "@/lib/supabase/types";

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
}: {
  analysisId: string;
  initial: Simulation | null;
}) {
  // Current simulation we're tracking. null = no simulation yet (show form).
  const [sim, setSim] = useState<Simulation | null>(initial);
  // Force-render the form even if a successful sim exists ("Re-run" button)
  const [showForm, setShowForm] = useState(false);

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
  }, [sim?.id, sim?.status]);

  // CASE 1: no simulation yet OR user clicked "Re-run with new inputs"
  if (!sim || showForm) {
    return (
      <SimulatorEmpty
        analysisId={analysisId}
        previousError={sim?.status === "failed" ? sim.error : null}
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
            <Badge variant="gold">
              <Sparkles className="size-3" />
              Scale plan
            </Badge>
          </div>
          <p className="mt-1 text-sm text-white/55">
            7-day Meta Ads projection · AOV ${sim.aov_usd} · ${sim.daily_budget_usd}/day budget
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowForm(true)}
          className="shrink-0"
        >
          <RotateCw className="size-3.5" />
          Re-run
        </Button>
      </header>

      {sim.error && (
        <Card className="p-3 border-warning/20 bg-warning/[0.04]">
          <p className="text-xs text-warning">
            Partial result —{" "}
            <span className="text-white/70">{sim.error}</span>
          </p>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {scenarios.map((s, i) => (
          <SimulatorScenarioCard key={s.variant} scenario={s} index={i} />
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
