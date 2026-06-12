"use client";

import { motion } from "framer-motion";
import { Layers, CheckCircle2, AlertTriangle, CircleDot } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AnalysisResult } from "@/lib/supabase/types";

/**
 * Venn-style strengths/issues split.
 *
 * Takes the 6 category_scores and partitions them into 3 buckets by score:
 *   • ≥ 65 → Strength (left circle, green-ish)
 *   • 45-64 → Mixed signal (overlap zone)
 *   • < 45 → Critical issue (right circle, red-ish)
 *
 * Gives the operator a one-glance "what's working / what's broken" view
 * without making them read the radar chart values. The headline at the
 * bottom states the net assessment in plain English.
 */

const CATEGORY_LABELS: Record<string, string> = {
  color_integration: "Color & branding",
  layout_proportion: "Layout & spacing",
  image_quality: "Image quality",
  technical_optimization: "Technical / speed",
  niche_coherence: "Niche fit",
  cro_principles: "CRO fundamentals",
};

type Bucket = "strength" | "mixed" | "issue";

interface Item {
  key: string;
  label: string;
  score: number;
  bucket: Bucket;
}

function bucketize(score: number): Bucket {
  // Auto-detect normalized 0..1 vs 0..100 to be defensive
  const s = score > 1 ? score : score * 100;
  if (s >= 65) return "strength";
  if (s >= 45) return "mixed";
  return "issue";
}

export function StrengthsIssuesMap({
  scores,
}: {
  scores: AnalysisResult["category_scores"];
}) {
  const items: Item[] = Object.entries(scores).map(([key, value]) => ({
    key,
    label: CATEGORY_LABELS[key] ?? key,
    score: value,
    bucket: bucketize(value),
  }));

  const strengths = items.filter((i) => i.bucket === "strength");
  const mixed = items.filter((i) => i.bucket === "mixed");
  const issues = items.filter((i) => i.bucket === "issue");

  // One-line net assessment
  const verdict =
    issues.length >= 3
      ? {
          text: `${issues.length} critical issues are dragging this store down. Focus on fixing those before optimizing strengths.`,
          tone: "text-destructive",
        }
      : strengths.length >= 4
        ? {
            text: `${strengths.length} strong fundamentals. Polish ${mixed.length + issues.length} weak areas to push into elite territory.`,
            tone: "text-success",
          }
        : {
            text: `Mixed picture: ${strengths.length} strengths, ${issues.length} issues, ${mixed.length} in-between. Prioritize the issues first.`,
            tone: "text-warning",
          };

  return (
    <Card className="p-6 relative overflow-hidden h-full">
      <div className="pointer-events-none absolute -left-10 -bottom-10 size-48 rounded-full bg-success/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-destructive/10 blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="size-4 text-champagne-400" />
          <h3 className="text-sm font-medium">Strengths vs. issues</h3>
        </div>

        {/* Venn-style 3-column layout */}
        <div className="grid grid-cols-3 gap-2">
          {/* Strengths */}
          <Bucket
            title="Strengths"
            count={strengths.length}
            icon={CheckCircle2}
            color="success"
            items={strengths}
          />

          {/* Mixed */}
          <Bucket
            title="Mixed"
            count={mixed.length}
            icon={CircleDot}
            color="warning"
            items={mixed}
          />

          {/* Issues */}
          <Bucket
            title="Critical issues"
            count={issues.length}
            icon={AlertTriangle}
            color="destructive"
            items={issues}
          />
        </div>

        {/* Net assessment */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-5 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3"
        >
          <p className={`text-xs leading-relaxed ${verdict.tone}`}>
            <span className="uppercase tracking-widest text-[10px] text-white/40 mr-1">
              Net:
            </span>
            {verdict.text}
          </p>
        </motion.div>
      </div>
    </Card>
  );
}

function Bucket({
  title,
  count,
  icon: Icon,
  color,
  items,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: "success" | "warning" | "destructive";
  items: Item[];
}) {
  const tone =
    color === "success"
      ? {
          ring: "ring-success/30",
          bg: "bg-success/[0.05]",
          text: "text-success",
          dot: "bg-success/80",
        }
      : color === "warning"
        ? {
            ring: "ring-warning/30",
            bg: "bg-warning/[0.05]",
            text: "text-warning",
            dot: "bg-warning/80",
          }
        : {
            ring: "ring-destructive/30",
            bg: "bg-destructive/[0.05]",
            text: "text-destructive",
            dot: "bg-destructive/80",
          };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl ring-1 ${tone.ring} ${tone.bg} p-3 min-h-[140px]`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`size-3.5 ${tone.text}`} />
          <span className="text-[10px] uppercase tracking-widest text-white/70 font-medium">
            {title}
          </span>
        </div>
        <span className={`font-serif text-lg tnum ${tone.text}`}>{count}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-[11px] text-white/30">None</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((it) => {
            const s = it.score > 1 ? it.score : it.score * 100;
            return (
              <li
                key={it.key}
                className="flex items-center gap-1.5 text-[11px] text-white/75 leading-tight"
              >
                <span
                  className={`shrink-0 size-1 rounded-full ${tone.dot}`}
                />
                <span className="flex-1 truncate">{it.label}</span>
                <span className="tnum text-white/40">{Math.round(s)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
