"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Wrench,
  ScanSearch,
  MessageSquare,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Report index (jump nav) — a compact overview of what the finished audit
 * contains, shown at the very top of the report. Clicking a chip smooth-scrolls
 * to that section.
 *
 * Purely presentational and client-side: it reads nothing, computes nothing on
 * the pipeline, and adds zero latency to an analysis. It only renders once the
 * audit is done (the parent already gates on `isDone`). The section ids it
 * targets are set on the matching wrappers in analysis-view; if one is ever
 * absent, the click is a harmless no-op (guarded below).
 *
 * Labels are intentionally English-only (product decision) and cover the five
 * highest-signal sections — the rest (Winners, Library bridge, live Meta tools)
 * live inside these and don't need their own entry.
 */

export interface ReportSection {
  id: string;
  label: string;
  Icon: LucideIcon;
}

/** The canonical five, in report order. Exported so the parent stays in sync. */
export const REPORT_SECTIONS: ReportSection[] = [
  { id: "section-growth-map", label: "Growth Map", Icon: TrendingUp },
  { id: "section-fixes", label: "Priority Fixes", Icon: Wrench },
  { id: "section-audit", label: "Annotated Audit", Icon: ScanSearch },
  { id: "section-persona", label: "Buyer Persona", Icon: MessageSquare },
  { id: "section-meta", label: "Meta Readiness", Icon: Megaphone },
];

export function ReportNav({
  sections = REPORT_SECTIONS,
}: {
  sections?: ReportSection[];
}) {
  const jump = useCallback((id: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-white/35">
            In this report
          </span>
          <nav className="flex flex-1 flex-wrap items-center gap-1.5">
            {sections.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11.5px] text-white/60 transition-colors hover:border-signal-400/30 hover:bg-signal-500/[0.06] hover:text-white"
              >
                <span className="grid size-4 place-items-center rounded-full bg-white/[0.05] text-[9px] font-semibold text-white/45 group-hover:bg-signal-500/15 group-hover:text-signal-200">
                  {i + 1}
                </span>
                <s.Icon className="size-3 text-white/40 group-hover:text-signal-300" />
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </Card>
    </motion.div>
  );
}
