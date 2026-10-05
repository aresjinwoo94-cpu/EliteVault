"use client";

import { useState } from "react";
import { m as motion } from "framer-motion";
import {
  Shield,
  Scale,
  Flame,
  AlertTriangle,
  Target,
  Lightbulb,
  ChevronDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimulatorChart } from "./simulator-chart";
import { cn } from "@/lib/utils";
import type { SimulationScenario } from "@/lib/supabase/types";
import { useT } from "@/components/i18n/locale-provider";

/**
 * One scenario card (conservative | balanced | aggressive).
 *
 * Visual hierarchy:
 *   1. Headline ROAS — the number every media buyer looks at first.
 *   2. Totals strip — spend / revenue / purchases / CPA over the 7 days.
 *   3. Chart — spend vs revenue over time.
 *   4. Risks + recommendation — the honest reality check.
 *
 * Color coding per variant: conservative = blue/cool, balanced = champagne,
 * aggressive = warm/red. The accent informs but doesn't scream.
 */

const VARIANT_META: Record<
  SimulationScenario["variant"],
  {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    accent: string;       // tailwind ring + text color stub
    accentBg: string;     // soft tinted bg gradient stub
    accentBlur: string;   // ambient glow color
  }
> = {
  conservative: {
    label: "simulator.scCons",
    Icon: Shield,
    accent: "text-sky-300 ring-sky-400/30",
    accentBg: "from-sky-400/[0.04] to-transparent",
    accentBlur: "bg-sky-400/15",
  },
  balanced: {
    label: "simulator.scBal",
    Icon: Scale,
    accent: "text-champagne-300 ring-champagne-400/30",
    accentBg: "from-champagne-400/[0.05] to-transparent",
    accentBlur: "bg-champagne-400/15",
  },
  aggressive: {
    label: "simulator.scAggr",
    Icon: Flame,
    accent: "text-rose-300 ring-rose-400/30",
    accentBg: "from-rose-400/[0.04] to-transparent",
    accentBlur: "bg-rose-400/15",
  },
};

function fmtUsd(n: number, max = 0) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: max })}`;
}

export function SimulatorScenarioCard({
  scenario,
  index,
}: {
  scenario: SimulationScenario;
  index: number;
}) {
  const { t } = useT();
  const meta = VARIANT_META[scenario.variant];
  const { Icon } = meta;
  const totals = scenario.totals;
  const [openDays, setOpenDays] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
    >
      <Card
        className={`relative overflow-hidden p-5 md:p-6 h-full bg-gradient-to-br ${meta.accentBg}`}
      >
        <div
          className={`pointer-events-none absolute -right-12 -top-12 size-40 rounded-full ${meta.accentBlur} blur-3xl`}
        />

        <div className="relative">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div
              className={`flex size-7 items-center justify-center rounded-lg ring-1 ${meta.accent}`}
            >
              <Icon className={`size-3.5 ${meta.accent.split(" ")[0]}`} />
            </div>
            <h4 className="font-medium text-white">{t(meta.label)}</h4>
          </div>

          {/*
            Headline ROAS. Color-coded by profitability tier — gold for
            net-profit (>= 1.5x), white for break-even-ish (1.0-1.5x), red
            for projected loss (< 1.0x). The simulator is now explicitly
            allowed to project losses for weak stores, so the visual must
            match — green/gold ROAS for a 0.8x projection would lie about
            what the operator is reading.
          */}
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className={`font-serif text-5xl tnum leading-none ${
                totals.roas >= 1.5
                  ? "text-gold-gradient"
                  : totals.roas >= 1.0
                    ? "text-white"
                    : "text-destructive"
              }`}
            >
              {totals.roas.toFixed(2)}x
            </span>
            <span className="text-xs text-white/45 uppercase tracking-widest">
              {t("simulator.roas7")}
              {totals.roas < 1.0 && (
                <span className="ml-2 text-destructive/80 normal-case">
                  {t("simulator.projectedLoss")}
                </span>
              )}
            </span>
          </div>

          <p className="mt-3 text-sm text-white/65 leading-relaxed">
            {scenario.summary}
          </p>

          {/* Win condition */}
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
            <Target className="size-3.5 text-white/40 mt-0.5 shrink-0" />
            <p className="text-xs text-white/70 leading-relaxed">
              <span className="text-white/40">{t("simulator.winCondition")} </span>
              {scenario.win_condition}
            </p>
          </div>

          {/*
            Totals strip with explicit Net P&L. Net = revenue - spend
            (rough gross — doesn't account for COGS, that's what `margin`
            input is for). Color-coded: green if positive, red if negative.
            The simulator is honest about losses now; the UI shows them.
          */}
          {(() => {
            const net = totals.revenue - totals.spend;
            const netLabel = net >= 0 ? `+${fmtUsd(net)}` : `−${fmtUsd(Math.abs(net))}`;
            return (
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {(
                  [
                    [t("simulator.spend"), fmtUsd(totals.spend), "text-white"],
                    [t("simulator.revenue"), fmtUsd(totals.revenue), "text-white"],
                    [
                      t("simulator.net"),
                      netLabel,
                      net >= 0 ? "text-success" : "text-destructive",
                    ],
                    [t("simulator.sales"), `${Math.round(totals.purchases)}`, "text-white"],
                    ["CPA", fmtUsd(totals.cpa, 2), "text-white"],
                  ] as const
                ).map(([label, val, color]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2 text-center"
                  >
                    <p className="text-[9px] uppercase tracking-widest text-white/40">
                      {label}
                    </p>
                    <p className={`mt-0.5 font-serif text-sm tnum ${color}`}>
                      {val}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Chart */}
          <div className="mt-5">
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
              {t("simulator.proj7")}
            </p>
            <SimulatorChart days={scenario.days} />
          </div>

          {/* Day-by-day breakdown — collapsible accordion inside the card
              (Fase 2 P0-1). Keeps the card scannable while the detail is one
              click away. */}
          {scenario.days?.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setOpenDays((v) => !v)}
                aria-expanded={openDays}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="text-xs font-medium text-white/70">
                  {t("simulator.dayByDay")}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-white/40 transition-transform",
                    openDays && "rotate-180",
                  )}
                />
              </button>
              {openDays && (
                <div className="overflow-x-auto px-2 pb-3">
                  <table className="w-full min-w-[360px] border-collapse text-right text-[11px]">
                    <thead>
                      <tr className="text-white/40">
                        <th className="px-2 py-1 text-left font-normal">{t("simulator.day")}</th>
                        <th className="px-2 py-1 font-normal">{t("simulator.spend")}</th>
                        <th className="px-2 py-1 font-normal">{t("simulator.revenue")}</th>
                        <th className="px-2 py-1 font-normal">{t("simulator.sales")}</th>
                        <th className="px-2 py-1 font-normal">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.days.map((d) => (
                        <tr
                          key={d.day}
                          className="border-t border-white/[0.04] text-white/75"
                        >
                          <td className="px-2 py-1 text-left text-white/50">
                            {d.day}
                          </td>
                          <td className="px-2 py-1 tabular-nums">
                            {fmtUsd(d.spend)}
                          </td>
                          <td className="px-2 py-1 tabular-nums">
                            {fmtUsd(d.revenue)}
                          </td>
                          <td className="px-2 py-1 tabular-nums">
                            {Math.round(d.purchases)}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1 tabular-nums",
                              d.roas >= 1 ? "text-success" : "text-destructive",
                            )}
                          >
                            {d.roas.toFixed(2)}x
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Risks */}
          <div className="mt-5">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="size-3.5 text-warning" />
              <p className="text-[10px] uppercase tracking-widest text-warning">
                {t("simulator.risks")}
              </p>
            </div>
            <ul className="space-y-1">
              {scenario.risks.map((r, i) => (
                <li
                  key={i}
                  className="text-xs text-white/65 leading-relaxed pl-3 relative before:absolute before:left-0 before:top-1.5 before:size-1 before:rounded-full before:bg-warning/60"
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Recommendation */}
          <div className="mt-5 rounded-xl border border-champagne-400/15 bg-champagne-400/[0.04] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Lightbulb className="size-3.5 text-champagne-300" />
              <Badge variant="gold" className="text-[9px]">
                {t("simulator.tactical")}
              </Badge>
            </div>
            <p className="text-xs text-white/80 leading-relaxed">
              {scenario.recommendation}
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
