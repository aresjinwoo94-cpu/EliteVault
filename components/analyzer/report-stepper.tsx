"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";
import { Lock, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Report stepper (analyzer-report-redesign brief §A.5) — the v2 report's ONE
 * index. It fuses the old Growth Map + ReportNav + teaser strip into a single
 * compact, thin sticky bar: one custom icon per section, each an anchor that
 * smooth-scrolls to it. Deliberately NOT a tall diagram of boxes/arrows — a big
 * fixed bar eats the very viewport it's meant to help navigate.
 *
 * The icon set is one coherent visual language (all lucide line icons, same
 * weight) with NO third-party logos (§A.5): mixing Shopify/Meta marks with
 * concept icons reads amateur and is a brand risk. Each item carries a short
 * label (an icon alone is ambiguous) and an aria-label.
 *
 * Gated sections (Winners, Simulator) render `locked` for a free viewer — a
 * padlock teaser that still deep-links, so the icon pulls toward the upgrade
 * rather than sitting dead. Gating itself is unchanged and lives at the
 * destination.
 */

export interface StepperSection {
  id: string;
  label: string;
  ariaLabel: string;
  Icon: LucideIcon;
  /** The simulator — the paid star; gets a colour accent to pull the eye. */
  accent?: boolean;
  /** Free viewer: show a padlock over the icon (still scrolls to the teaser). */
  locked?: boolean;
}

export function ReportStepper({
  sections,
  belowTopbar = false,
}: {
  sections: StepperSection[];
  /**
   * Offset the sticky bar under the authenticated AppTopbar (h-14). The
   * anonymous report has no chrome, so it starts at 0. Same contract as
   * ReportNav, which this replaces.
   */
  belowTopbar?: boolean;
}) {
  const { t } = useT();
  const jump = useCallback((id: string) => {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  if (sections.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={`sticky z-30 bg-obsidian-900 ${belowTopbar ? "top-14" : "top-0"}`}
    >
      <Card className="px-4 py-2.5">
        <div className="flex items-center gap-x-3">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-widest text-white/35">
            {t("report.v2NavLabel")}
          </span>
          {/* One row that scrolls sideways rather than wrapping — a wrapped bar
              grows to two or three lines on a phone, and a sticky element that
              tall defeats the purpose. The scrollbar is hidden; the clipped
              chips are the affordance. `py-1 -my-1` keeps focus rings from
              clipping without changing the bar height. */}
          <nav className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto py-1 -my-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                aria-label={
                  s.locked
                    ? `${s.ariaLabel} ${t("report.v2StepLocked")}`
                    : s.ariaLabel
                }
                className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                  s.accent
                    ? "border-champagne-400/40 bg-champagne-400/[0.09] text-white/90 hover:border-champagne-300/60 hover:bg-champagne-400/[0.16] hover:text-white"
                    : "border-white/[0.07] bg-white/[0.02] text-white/60 hover:border-signal-400/30 hover:bg-signal-500/[0.06] hover:text-white"
                }`}
              >
                <span
                  className={`relative grid size-4 place-items-center rounded-full ${
                    s.accent
                      ? "bg-champagne-400/20 text-champagne-200 group-hover:bg-champagne-400/30"
                      : "bg-white/[0.05] text-white/45 group-hover:bg-signal-500/15 group-hover:text-signal-200"
                  }`}
                >
                  {s.locked ? (
                    <Lock aria-hidden="true" className="size-2.5" />
                  ) : (
                    <s.Icon aria-hidden="true" className="size-2.5" />
                  )}
                </span>
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </Card>
    </motion.div>
  );
}
