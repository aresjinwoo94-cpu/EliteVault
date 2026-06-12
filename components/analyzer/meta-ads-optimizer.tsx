"use client";

import { motion } from "framer-motion";
import { Megaphone, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MetaAdsRecommendation } from "@/lib/supabase/types";

const FORMAT_LABEL: Record<string, string> = {
  "single-image": "Single image",
  carousel: "Carousel",
  "ugc-video": "UGC video",
  "demo-video": "Demo video",
};

export function MetaAdsOptimizer({ meta }: { meta: MetaAdsRecommendation }) {
  const t = meta.targets;
  return (
    <Card className="p-6 md:p-7 relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="size-4 text-champagne-400" />
            <h3 className="font-medium">Meta Ads Optimizer</h3>
            <Badge variant="gold">
              <Sparkles className="size-3" />
              Scale plan
            </Badge>
          </div>
          <p className="mt-1 text-sm text-white/55">
            Targets + creative angles + a sequential testing plan, calibrated
            to your audit score and niche.
          </p>
        </div>
        <Badge variant="default">
          ${meta.budget_band.daily_min}-${meta.budget_band.daily_max}/day
        </Badge>
      </div>

      {/* Targets row */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
        {(
          [
            ["CPC", `$${t.cpc.toFixed(2)}`, "Max bid"],
            ["CPM", `$${t.cpm.toFixed(2)}`, "Cost / 1k"],
            ["CTR", `${(t.ctr * 100).toFixed(2)}%`, "Click rate"],
            ["CVR", `${(t.cvr * 100).toFixed(2)}%`, "LP conv."],
            ["ROAS", `${t.roas.toFixed(1)}x`, "Target return"],
          ] as const
        ).map(([label, val, sub]) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center"
          >
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              {label}
            </p>
            <p className="mt-1 font-mono tabular-nums text-xl tnum text-white">{val}</p>
            <p className="mt-0.5 text-[10px] text-white/40">{sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Audience + Targeting */}
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="size-3.5 text-signal-300" />
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              Audience seed
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
              Targeting suggestions
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs">
              <span className="text-white/40">Interests:</span>{" "}
              <span className="text-white/80">
                {meta.targeting.interests.slice(0, 6).join(", ") || "—"}
              </span>
            </p>
            <p className="text-xs">
              <span className="text-white/40">Custom audiences:</span>{" "}
              <span className="text-white/80">
                {meta.targeting.custom_audiences.slice(0, 4).join(", ") || "—"}
              </span>
            </p>
            <p className="text-xs">
              <span className="text-white/40">Exclude:</span>{" "}
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
          <p className="text-sm font-medium">Creative angles</p>
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
                <Badge variant="default">{FORMAT_LABEL[c.format] ?? c.format}</Badge>
              </div>
              <p className="mt-2 text-xs italic text-white/65 leading-relaxed">
                "{c.hook}"
              </p>
              <p className="mt-2 text-[11px] text-champagne-300">
                CTA: {c.cta}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Testing plan */}
      <div className="mt-6">
        <p className="text-sm font-medium mb-3">Testing plan</p>
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
                  ${step.budget}/day · {step.days} days
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Caveats */}
      <div className="mt-6 rounded-xl border border-warning/20 bg-warning/[0.04] p-4">
        <p className="text-[10px] uppercase tracking-widest text-warning mb-1.5">
          Honest caveats
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
