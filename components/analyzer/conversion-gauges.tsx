"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { clamp } from "@/lib/utils";
import type { ConversionScenarios } from "@/lib/supabase/types";

const SCENARIOS: {
  key: keyof ConversionScenarios;
  label: string;
  tone: "champagne" | "destructive" | "warning" | "success";
}[] = [
  { key: "organic", label: "Organic", tone: "champagne" },
  { key: "meta_ads_bad", label: "Meta — bad creative", tone: "destructive" },
  { key: "meta_ads_regular", label: "Meta — regular", tone: "warning" },
  { key: "meta_ads_good", label: "Meta — top buyer", tone: "success" },
];

export function ConversionGauges({
  scenarios,
}: {
  scenarios: ConversionScenarios;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-white">
          Estimated conversion rate
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-white/30">
          4 scenarios
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {SCENARIOS.map((s, i) => {
          const value = clamp(scenarios[s.key], 0, 0.12);
          const pct = (value * 100).toFixed(2);
          const barWidth = (value / 0.06) * 100; // 6% conv = full bar
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-white/55">{s.label}</span>
                <span className="font-mono tnum text-white/85">
                  {pct}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(barWidth, 100)}%` }}
                  transition={{ delay: 0.1 + i * 0.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className={
                    s.tone === "champagne"
                      ? "h-full bg-gradient-to-r from-champagne-500 to-champagne-300"
                      : s.tone === "success"
                        ? "h-full bg-gradient-to-r from-success/70 to-success"
                        : s.tone === "warning"
                          ? "h-full bg-gradient-to-r from-warning/70 to-warning"
                          : "h-full bg-gradient-to-r from-destructive/70 to-destructive"
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[10px] leading-relaxed text-white/30">
        Estimates based on niche benchmarks + design audit. Real numbers depend
        on offer, traffic temperature and creative.
      </p>
    </Card>
  );
}
