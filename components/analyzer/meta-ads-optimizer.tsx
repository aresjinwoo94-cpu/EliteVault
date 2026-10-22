"use client";

import { m as motion } from "framer-motion";
import { Megaphone, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { nicheBenchmarks } from "@/lib/meta/niche-benchmarks";
import type { MetaAdsRecommendation } from "@/lib/supabase/types";
import { useT } from "@/components/i18n/locale-provider";
import { fill } from "@/lib/i18n/lookup";

const FORMAT_LABEL: Record<string, string> = {
  "single-image": "optimizer.fmtImage",
  carousel: "optimizer.fmtCarousel",
  "ugc-video": "optimizer.fmtUgc",
  "demo-video": "optimizer.fmtDemo",
};

export function MetaAdsOptimizer({ meta }: { meta: MetaAdsRecommendation }) {
  const { t } = useT();
  const tg = meta.targets;
  // Niche reference bands so each target reads against its category median.
  const bands = nicheBenchmarks(meta.niche);
  return (
    <Card className="p-6 md:p-7 relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="size-4 text-champagne-400" />
            <h3 className="font-medium">{t("optimizer.title")}</h3>
            <Badge variant="gold">
              <Sparkles className="size-3" />
              {t("simulator.scalePlan")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-white/55">
            {t("optimizer.intro")}
          </p>
        </div>
        <Badge variant="default">
          ${meta.budget_band.daily_min}-${meta.budget_band.daily_max}/day
        </Badge>
      </div>

      {/* Targets row. Each target shows its niche median band beneath it —
          a raw number is meaningless without one. If we have no niche band for
          a metric we DROP that metric rather than show a naked number. Presentation only
          (brief oct-2026 metrics clarity): a clear name, one plain line and whether
          higher or lower is better; the values themselves come from the agent, untouched. */}
      <p className="mt-6 text-xs font-medium text-white/60">{t("optimizer.targetsHeading")}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {(
          [
            ["CPC", `$${tg.cpc.toFixed(2)}`, "maxBid", "cpcLine", "low", bands && `$${bands.cpc[0].toFixed(2)}–$${bands.cpc[1].toFixed(2)}`],
            ["CPM", `$${tg.cpm.toFixed(2)}`, "costK", "cpmLine", "low", bands && `$${bands.cpm[0].toFixed(0)}–$${bands.cpm[1].toFixed(0)}`],
            ["CTR", `${(tg.ctr * 100).toFixed(2)}%`, "ctr", "ctrLine", "high", bands && `${(bands.ctr[0] * 100).toFixed(1)}–${(bands.ctr[1] * 100).toFixed(1)}%`],
            ["CVR", `${(tg.cvr * 100).toFixed(2)}%`, "lpConv", "cvrLine", "high", bands && `${(bands.cvr[0] * 100).toFixed(1)}–${(bands.cvr[1] * 100).toFixed(1)}%`],
            ["ROAS", `${tg.roas.toFixed(1)}x`, "targetReturn", "roasLine", "high", bands && `${bands.roas[0].toFixed(1)}–${bands.roas[1].toFixed(1)}x`],
          ] as const
        )
          .filter(([, , , , , band]) => band) // drop metrics with no niche band
          .map(([label, val, nameKey, lineKey, dir, band]) => (
            <motion.div
              key={label}
              data-metric={label}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 odd:last:col-span-2 md:odd:last:col-span-1"
            >
              <p className="text-xs font-medium leading-tight text-white/80">
                {t(`optimizer.${nameKey}`)}{" "}
                <span className="text-[10px] uppercase tracking-widest text-white/35">{label}</span>
              </p>
              <p className="mt-1.5 font-mono tabular-nums text-xl tnum text-white">{val}</p>
              <p className="mt-1 text-[11px] leading-snug text-white/55">
                {fill(t(`optimizer.${lineKey}`), { x: tg.roas.toFixed(1), usd: tg.roas.toFixed(2) })}
              </p>
              <p className="mt-1 flex-1 text-[10px] text-white/35">
                {dir === "low" ? "↓ " + t("optimizer.lowerBetter") : "↑ " + t("optimizer.higherBetter")}
              </p>
              <p className="mt-2 border-t border-white/[0.06] pt-1.5 text-[11px] leading-tight text-white/45">
                {t("optimizer.nicheMedian")}
                <br />
                <span className="text-white/60">{band}</span>
              </p>
            </motion.div>
          ))}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-white/40">{t("optimizer.marginNote")}</p>

      {/* Audience + Targeting */}
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="size-3.5 text-signal-300" />
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              {t("optimizer.audienceSeed")}
            </p>
          </div>
          <p className="text-sm text-white/80 leading-relaxed">
            {meta.audience_seed}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="size-3.5 text-signal-300" />
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              {t("optimizer.targeting")}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs">
              <span className="text-white/40">{t("optimizer.interests")}</span>{" "}
              <span className="text-white/80">
                {meta.targeting.interests.slice(0, 6).join(", ") || "—"}
              </span>
            </p>
            <p className="text-xs">
              <span className="text-white/40">{t("optimizer.custom")}</span>{" "}
              <span className="text-white/80">
                {meta.targeting.custom_audiences.slice(0, 4).join(", ") || "—"}
              </span>
            </p>
            <p className="text-xs">
              <span className="text-white/40">{t("optimizer.exclude")}</span>{" "}
              <span className="text-white/80">
                {meta.targeting.exclusions.slice(0, 4).join(", ") || "—"}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Creatives */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="size-4 text-champagne-300" />
          <p className="text-sm font-medium">{t("optimizer.angles")}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {meta.creatives.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-white leading-tight">
                  {c.angle}
                </p>
                <Badge variant="default">{FORMAT_LABEL[c.format] ? t(FORMAT_LABEL[c.format]) : c.format}</Badge>
              </div>
              <p className="mt-2 text-xs text-white/65 leading-relaxed">
                "{c.hook}"
              </p>
              <p className="mt-2 text-[11px] text-champagne-300">
                {t("optimizer.cta")} {c.cta}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Testing plan */}
      <div className="mt-6">
        <p className="text-sm font-medium mb-3">{t("optimizer.testPlan")}</p>
        <ol className="space-y-2">
          {meta.testing_plan.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3"
            >
              <span className="font-mono tabular-nums text-2xl text-gold-gradient tnum w-7 text-center shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{step.step}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {fill(t("optimizer.stepLine"), { budget: step.budget, days: step.days })}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Caveats */}
      <div className="mt-6 rounded-xl border border-warning/20 bg-warning/[0.04] p-4">
        <p className="text-[10px] uppercase tracking-widest text-warning mb-1.5">
          {t("optimizer.caveats")}
        </p>
        <ul className="space-y-1">
          {meta.caveats.map((c, i) => (
            <li key={i} className="text-xs text-white/70 leading-relaxed">
              · {c}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
