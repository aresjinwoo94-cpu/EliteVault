"use client";

import { m as motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  conversionScenarioBands,
  type ScenarioKey,
} from "@/lib/analyzer/conversion-scenarios";
import { bandOfHundred, rangeText } from "@/lib/analyzer/band-copy";
import { useT } from "@/components/i18n/locale-provider";
import { fill } from "@/lib/i18n/lookup";

/**
 * "How many visitors buy" — conversion-rate scenarios (brief oct-2026 metrics clarity).
 *
 * These are deterministic BANDS derived in code from the audit score + the store's niche — never a single
 * 2-decimal % a model made up. The card answers one question in plain words: out of every 100 visitors, how
 * many are likely to buy, by where they come from. The three Meta scenarios come first (worst to best) because
 * they are the ones to compare; organic is a separate REFERENCE row at the bottom: it converts higher because
 * those people already searched for the store, but it brings far fewer visits.
 */

type Tone = "champagne" | "destructive" | "warning" | "success";

const META: Record<ScenarioKey, { label: string; tone: Tone }> = {
  meta_ads_bad: { label: "gauges.metaBad", tone: "destructive" },
  meta_ads_regular: { label: "gauges.metaRegular", tone: "warning" },
  meta_ads_good: { label: "gauges.metaGood", tone: "success" },
  organic: { label: "gauges.organic", tone: "champagne" },
};

/** Meta scenarios, worst to best. Organic is rendered apart, below the divider. */
const META_ORDER: ScenarioKey[] = ["meta_ads_bad", "meta_ads_regular", "meta_ads_good"];

function pct(fraction: number): string {
  // 0.013 → "1.3", trimming a trailing ".0" for clean bands like "3%".
  const v = fraction * 100;
  return (Math.round(v * 10) / 10).toString();
}

const BAR: Record<Tone, string> = {
  champagne: "h-full bg-gradient-to-r from-champagne-500 to-champagne-300",
  success: "h-full bg-gradient-to-r from-success/70 to-success",
  warning: "h-full bg-gradient-to-r from-warning/70 to-warning",
  destructive: "h-full bg-gradient-to-r from-destructive/70 to-destructive",
};

export function ConversionGauges({
  score,
  niche,
}: {
  score: number;
  niche: string;
}) {
  const { t } = useT();
  const bands = conversionScenarioBands(score, niche);
  const byKey = new Map(bands.map((b) => [b.key, b]));
  // Scale the bars to the widest high end so the relative story reads at a glance.
  const maxHigh = Math.max(...bands.map((b) => b.high), 0.001);

  function row(key: ScenarioKey, i: number) {
    const b = byKey.get(key)!;
    const meta = META[key];
    const barWidth = (b.high / maxHigh) * 100;
    const h = bandOfHundred(b.low, b.high);
    const human =
      h.kind === "range"
        ? fill(t("gauges.ofHundred"), { range: rangeText(h) })
        : h.kind === "upTo"
          ? fill(t("gauges.ofHundredUpTo"), { n: h.hi })
          : t("gauges.ofHundredLess");
    return (
      <div key={key} data-scenario={key}>
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-white/65">{t(meta.label)}</span>
          <span className="shrink-0 text-right">
            <span className="font-mono tnum text-white/85">
              {pct(b.low)}–{pct(b.high)}%
            </span>
            <span className="ml-2 text-[10px] text-white/40">{human}</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(barWidth, 100)}%` }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className={BAR[meta.tone]}
          />
        </div>
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-white">
          {t("gauges.title")}
        </h3>
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-white/30">
          {t("gauges.aiRanges")}
        </span>
      </div>
      <p className="mt-1 text-xs text-white/50">{t("gauges.subtitle")}</p>

      <div className="mt-5 space-y-4">{META_ORDER.map((key, i) => row(key, i))}</div>

      {/* Organic: a reference row, apart from the scenarios worth comparing. */}
      <div className="mt-5 border-t border-white/[0.08] pt-4">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-white/30">{t("gauges.reference")}</p>
        {row("organic", META_ORDER.length)}
        <p className="mt-2 text-[11px] leading-snug text-white/40">{t("gauges.organicNote")}</p>
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-white/30">
        {t("gauges.note")}
      </p>
    </Card>
  );
}
