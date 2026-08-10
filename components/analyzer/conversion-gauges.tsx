"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  conversionScenarioBands,
  type ScenarioKey,
} from "@/lib/analyzer/conversion-scenarios";

/**
 * Estimated conversion-rate scenarios (brief §2).
 *
 * These are now deterministic BANDS derived in code from the audit score + the
 * store's niche — never a single 2-decimal % the model made up. Each row shows
 * a range (e.g. "1.3–1.9%") and the whole card is labelled an AI estimate, so
 * the report never contradicts the product's "no fake numbers" promise.
 */

const META: Record<
  ScenarioKey,
  { label: string; tone: "champagne" | "destructive" | "warning" | "success" }
> = {
  organic: { label: "Organic", tone: "champagne" },
  meta_ads_bad: { label: "Meta — bad creative", tone: "destructive" },
  meta_ads_regular: { label: "Meta — regular", tone: "warning" },
  meta_ads_good: { label: "Meta — top buyer", tone: "success" },
};

const ORDER: ScenarioKey[] = [
  "organic",
  "meta_ads_bad",
  "meta_ads_regular",
  "meta_ads_good",
];

function pct(fraction: number): string {
  // 0.013 → "1.3", trimming a trailing ".0" for clean bands like "3%".
  const v = fraction * 100;
  return (Math.round(v * 10) / 10).toString();
}

export function ConversionGauges({
  score,
  niche,
}: {
  score: number;
  niche: string;
}) {
  const bands = conversionScenarioBands(score, niche);
  const byKey = new Map(bands.map((b) => [b.key, b]));
  // Scale the bars to the widest high end so the relative story reads at a glance.
  const maxHigh = Math.max(...bands.map((b) => b.high), 0.001);

  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-white">
          Estimated conversion rate
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-white/30">
          AI estimate · ranges
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {ORDER.map((key, i) => {
          const b = byKey.get(key)!;
          const meta = META[key];
          const barWidth = (b.high / maxHigh) * 100;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-white/55">{meta.label}</span>
                <span className="font-mono tnum text-white/85">
                  {pct(b.low)}–{pct(b.high)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(barWidth, 100)}%` }}
                  transition={{ delay: 0.1 + i * 0.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className={
                    meta.tone === "champagne"
                      ? "h-full bg-gradient-to-r from-champagne-500 to-champagne-300"
                      : meta.tone === "success"
                        ? "h-full bg-gradient-to-r from-success/70 to-success"
                        : meta.tone === "warning"
                          ? "h-full bg-gradient-to-r from-warning/70 to-warning"
                          : "h-full bg-gradient-to-r from-destructive/70 to-destructive"
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Brief §2/§3 — bands, not single numbers; one short footnote (the
          canonical disclaimer sits once near the score above). */}
      <p className="mt-6 text-[11px] leading-relaxed text-white/30">
        Ranges modeled from your niche and audit score — an estimate, not a
        guarantee.
      </p>
    </Card>
  );
}
