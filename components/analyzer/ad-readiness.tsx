"use client";

import { motion } from "framer-motion";
import { Megaphone, ShieldAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AdReadiness } from "@/lib/supabase/types";

/**
 * "Ready for paid traffic?" — the media-buyer verdict.
 *
 * The overall score answers "is this store good?". This answers the question
 * the owner is actually about to spend money on: can this page take cold Meta
 * traffic TODAY, and if not, what stands in the way? The two deliberately
 * differ — a beautiful store with no price above the fold and no proof is a
 * high design score and a poor ad-readiness score, and that gap is the insight.
 *
 * Renders nothing when the audit predates the field (it's optional in the
 * schema), so old reports are unaffected.
 */

const VERDICTS = {
  ready: {
    label: "Ready for traffic",
    icon: CircleCheck,
    badge: "success" as const,
    tint: "border-success/20 from-success/[0.06]",
    accent: "text-success",
  },
  almost: {
    label: "Almost ready",
    icon: TriangleAlert,
    badge: "warning" as const,
    tint: "border-champagne-400/20 from-champagne-400/[0.06]",
    accent: "text-champagne-300",
  },
  not_ready: {
    label: "Not ready yet",
    icon: ShieldAlert,
    badge: "danger" as const,
    tint: "border-destructive/20 from-destructive/[0.06]",
    accent: "text-destructive",
  },
};

export function AdReadinessCard({ data }: { data?: AdReadiness | null }) {
  // Guard every field: this object comes from a model, and an audit stored
  // before the field existed simply has none of it.
  const verdict = data?.verdict;
  const meta = verdict ? VERDICTS[verdict] : null;
  const summary = data?.summary?.trim();
  if (!meta || !summary) return null;

  const score =
    typeof data?.score === "number" && Number.isFinite(data.score)
      ? Math.round(Math.max(0, Math.min(100, data.score)))
      : null;
  const blockers = (data?.blockers ?? []).filter(
    (b) => b && typeof b.title === "string" && b.title.trim(),
  );
  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card
        className={cn(
          "relative overflow-hidden bg-gradient-to-br to-transparent p-6",
          meta.tint,
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Megaphone className="size-4 text-signal-300" />
            <h3 className="text-sm font-medium text-white">
              Ready for Meta traffic?
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {score !== null && (
              <span className="font-mono text-sm tabular-nums text-white/70">
                {score}
                <span className="text-white/35">/100</span>
              </span>
            )}
            <Badge variant={meta.badge}>
              <Icon className={cn("size-3", meta.accent)} />
              {meta.label}
            </Badge>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-white/75">{summary}</p>

        {blockers.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              Fix before you spend
            </p>
            {blockers.map((b, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
              >
                <p className="text-sm font-medium leading-tight text-white">
                  {b.title}
                </p>
                {b.why?.trim() && (
                  <p className="mt-1 text-xs leading-relaxed text-white/55">
                    {b.why}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[10px] leading-snug text-white/35">
          A judgement on this page&apos;s fitness for cold paid traffic, not a
          prediction of results.
        </p>
      </Card>
    </motion.div>
  );
}
