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
  /**
   * Differentiators worth surfacing from the first frame.
   *
   * Buyer Persona and Meta Readiness are the two sections nobody else ships,
   * and both sit at the BOTTOM of a long report — the reading order is
   * deliberate (see analysis-view) so the fix is discovery, not reordering.
   * These chips get a signal-tinted rest state so they read differently from
   * the other three without shouting.
   */
  accent?: boolean;
}

/** The canonical five, in report order. Exported so the parent stays in sync. */
export const REPORT_SECTIONS: ReportSection[] = [
  { id: "section-growth-map", label: "Growth Map", Icon: TrendingUp },
  { id: "section-fixes", label: "Priority Fixes", Icon: Wrench },
  { id: "section-audit", label: "Annotated Audit", Icon: ScanSearch },
  {
    id: "section-persona",
    label: "Buyer Persona",
    Icon: MessageSquare,
    accent: true,
  },
  {
    id: "section-meta",
    label: "Meta Readiness",
    Icon: Megaphone,
    accent: true,
  },
];

export function ReportNav({
  sections = REPORT_SECTIONS,
  belowTopbar = false,
}: {
  sections?: ReportSection[];
  /**
   * Offset the sticky bar by the height of a fixed header above it.
   *
   * The authenticated report renders inside app/(app)/layout.tsx, whose
   * AppTopbar is `sticky top-0 z-40 h-14` — so the nav has to start at 56px
   * or it hides underneath it. The anonymous page (app/audit/[id]) renders
   * AnalysisView with no chrome at all, so there it starts at 0.
   *
   * z-30 keeps the bar under that z-40 topbar while still covering report
   * content, which carries no z-index at this level.
   */
  belowTopbar?: boolean;
}) {
  const jump = useCallback((id: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Fades in but does NOT slide: a `y` on a sticky element is a translate on
  // the element whose whole job is to sit at an exact offset, so until the
  // animation settles the bar rests that many pixels low and content shows
  // through the gap above it. Opacity alone reads the same and the bar is
  // pixel-exact from the first frame.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={`sticky z-30 bg-obsidian-900 ${belowTopbar ? "top-14" : "top-0"}`}
    >
      {/*
        `bg-card` is opaque (#101019), so scrolled content never shows through
        the body of the stuck bar — no backdrop-blur needed, and `.glass` is
        reserved for nav/overlays anyway (see components/ui/card.tsx).

        The wrapper repeats a background because the Card is `rounded-2xl`: the
        two ~16px arcs it cuts out of its own top corners are transparent, and
        while the bar is stuck that is exactly where scrolling content would
        show through. `bg-obsidian-900` is the page ground, so the arcs read as
        page rather than as moving content.
      */}
      <Card className="px-4 py-3">
        <div className="flex items-center gap-x-3">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-widest text-white/35">
            In this report
          </span>
          {/*
            One row that scrolls sideways instead of wrapping: a wrapped bar
            grows to two or three lines on a phone, and a sticky element that
            tall eats the viewport it is supposed to help navigate. The
            scrollbar itself is hidden — the chips are visibly clipped, which
            is the affordance.
          */}
          {/*
            `py-1 -my-1` buys vertical room for the focus ring: `overflow-x`
            other than `visible` forces `overflow-y` to compute the same way,
            so without the padding a keyboard user's ring is clipped top and
            bottom. The negative margin gives the padding back to the layout,
            so the bar height is unchanged.
          */}
          <nav className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto py-1 -my-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                /*
                  The accent rest state is deliberately DIMMER than the shared
                  hover state, not equal to it. Setting rest = hover is the easy
                  mistake here: the two differentiator chips then look
                  permanently pointed-at and give no feedback when they actually
                  are. Every accented value below sits one step under its hover
                  counterpart so hover still has somewhere to go.
                */
                className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors hover:border-signal-400/30 hover:bg-signal-500/[0.06] hover:text-white ${
                  s.accent
                    ? "border-signal-400/20 bg-signal-500/[0.035] text-white/75"
                    : "border-white/[0.07] bg-white/[0.02] text-white/60"
                }`}
              >
                <span
                  className={`grid size-4 place-items-center rounded-full text-[9px] font-semibold group-hover:bg-signal-500/15 group-hover:text-signal-200 ${
                    s.accent
                      ? "bg-signal-500/10 text-signal-300/70"
                      : "bg-white/[0.05] text-white/45"
                  }`}
                >
                  {i + 1}
                </span>
                <s.Icon
                  className={`size-3 group-hover:text-signal-300 ${
                    s.accent ? "text-signal-300/65" : "text-white/40"
                  }`}
                />
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </Card>
    </motion.div>
  );
}
