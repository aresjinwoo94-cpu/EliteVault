"use client";

import { motion } from "framer-motion";
import { Megaphone, ShieldAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";
import { linkIssues, paidTrafficBlockers } from "@/lib/analyzer/link-issues";
import type { AdReadiness, AnalysisResult } from "@/lib/supabase/types";

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

export function AdReadinessCard({
  data,
  overallScore,
  result,
  semaphoreOnly = false,
}: {
  data?: AdReadiness | null;
  /**
   * Brief §1 — the report's hero score. When present we render the bridge
   * sentence that ties this ad-readiness number back to the overall audit, so
   * the two never read as two unrelated scores competing for attention.
   */
  overallScore?: number | null;
  /**
   * Brief §3 — the full audit. When present, "fix before you spend" is rendered
   * as a FILTERED VIEW of the report's unified issue set (the canonical issues
   * that block paid traffic), so a blocker that's really the same problem as a
   * roadmap fix shows once and points at that fix — instead of restating it in
   * different words. Absent (e.g. the community page) → the raw blockers list.
   */
  result?: AnalysisResult | null;
  /**
   * Master brief §B2 — lead with the traffic-light verdict and HIDE the numeric
   * ad_readiness.score (it competed with the overall and read as a second grade).
   * The field stays in the schema for back-compat; we just stop painting it.
   */
  semaphoreOnly?: boolean;
}) {
  const { t } = useT();
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
  const rawBlockers = (data?.blockers ?? []).filter(
    (b) => b && typeof b.title === "string" && b.title.trim(),
  );
  const Icon = meta.icon;

  // Brief §3 — when we have the full result, render the UNIFIED, filtered view:
  // canonical issues that block paid traffic, each pointing at the roadmap fix
  // it maps to (if any) rather than restating it. Falls back to the raw
  // model-emitted blockers when the full result isn't available.
  const linked = result ? linkIssues(result) : null;
  const canonicalBlockers = linked
    ? paidTrafficBlockers(linked).map((iss) => {
        const fixRef = iss.refs.find((r) => r.source === "fix");
        const blockerRef = iss.refs.find((r) => r.source === "blocker");
        const why =
          (blockerRef &&
            result?.ad_readiness?.blockers?.[blockerRef.index]?.why?.trim()) ||
          (fixRef && result?.top_fixes?.[fixRef.index]?.why?.trim()) ||
          "";
        return {
          title: iss.title,
          why,
          // 1-indexed position in the roadmap, when this issue IS a roadmap fix.
          fixNumber: fixRef ? fixRef.index + 1 : null,
        };
      })
    : null;

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
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Megaphone className="size-4 text-signal-300" />
              <h3 className="text-sm font-medium text-white">
                Ready for Meta traffic?
              </h3>
            </div>
            {/* Brief §1 — label it explicitly as a lens on the same audit. */}
            <span className="pl-6 text-[10px] uppercase tracking-widest text-white/35">
              {t("report.adLensLabel")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!semaphoreOnly && score !== null && (
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

        {/* Brief §1 — the bridge sentence: relate this score to the overall
            hero so they read as one audit through two lenses, not two rival
            numbers. Only shown when we know both scores. */}
        {!semaphoreOnly &&
          score !== null &&
          typeof overallScore === "number" &&
          Number.isFinite(overallScore) && (
            <p className="mt-2 text-xs leading-relaxed text-signal-200/80">
              {t("report.adLensBridge").replace("{adScore}", String(score))}
            </p>
          )}

        {(canonicalBlockers ?? rawBlockers).length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              Fix before you spend
            </p>
            {canonicalBlockers
              ? canonicalBlockers.map((b, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-tight text-white">
                        {b.title}
                      </p>
                      {b.fixNumber !== null && (
                        <span className="shrink-0 rounded-full border border-signal-400/30 bg-signal-500/10 px-2 py-0.5 text-[10px] font-medium text-signal-200">
                          Roadmap fix #{b.fixNumber}
                        </span>
                      )}
                    </div>
                    {b.why && (
                      <p className="mt-1 text-xs leading-relaxed text-white/55">
                        {b.why}
                      </p>
                    )}
                  </div>
                ))
              : rawBlockers.map((b, i) => (
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
