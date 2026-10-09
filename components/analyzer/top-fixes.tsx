"use client";

import Link from "next/link";
import { m as motion } from "framer-motion";
import { ArrowUpRight, ExternalLink, Lock, Zap, Sparkles, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";
import { fill } from "@/lib/i18n/lookup";
import { themeBySlug } from "@/lib/analyzer/shopify-themes";

interface Fix {
  title: string;
  impact: "high" | "medium" | "low";
  effort: "S" | "M" | "L";
  /**
   * Business reason this fix matters. Optional: audits generated before the
   * field existed simply don't have it, and the row renders as it always did.
   */
  why?: string | null;
  /** Fix Tracks — what on THIS page justifies the fix. Absent on the urgent list. */
  evidence?: string | null;
  /** Fix Tracks (theme_colors) — slug from lib/analyzer/shopify-themes.ts. */
  theme_slug?: string | null;
}

/**
 * Prioritized fix list.
 *
 * `unlockedCount` controls the Free-tier "aha" gate (P1-6). Paid users pass
 * the default (Infinity) and see every fix. Free users pass `unlockedCount={1}`:
 * fix #1 renders fully actionable — a real, valuable change they can ship
 * today — and fixes #2+ render with their TITLE still readable (the point is
 * the user must know WHAT they're missing) but the impact/effort detail
 * blurred, plus a counter + Pro CTA. Seeing one real fix + the shape of the
 * rest converts far better than blurring the entire list.
 *
 * Fix Tracks reuse this exact rendering (rows, lock, blur, upsell) through the
 * optional `heading` / `header` / `note` / `children` slots, so nothing is
 * duplicated. With none of them set the output is identical to before.
 */
export function TopFixes({
  fixes,
  unlockedCount = Infinity,
  heading,
  header,
  note,
  children,
}: {
  fixes: Fix[];
  unlockedCount?: number;
  /** Overrides the card title. */
  heading?: string;
  /** Rendered right under the title (the Fix Tracks tab row). */
  header?: React.ReactNode;
  /** One fixed line above the list (e.g. the post-purchase disclaimer). */
  note?: React.ReactNode;
  /** Rendered after the list (loading / error / empty / locked states). */
  children?: React.ReactNode;
}) {
  const { t } = useT();
  const total = fixes?.length ?? 0;
  const lockedCount = Math.max(0, total - unlockedCount);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="size-4 text-champagne-400" />
        <h3 className="text-sm font-medium">{heading ?? t("topFixes.title")}</h3>
      </div>
      {header}
      {note}

      <ol className="space-y-2">
        {fixes.map((f, i) => {
          const locked = i >= unlockedCount;
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
                locked
                  ? "border-white/[0.04] bg-white/[0.015]"
                  : "border-white/[0.04] bg-white/[0.02] hover:border-white/[0.1]",
              )}
            >
              <span className="font-serif text-2xl text-gold-gradient tnum w-7 text-center">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {/* Title stays readable even when locked — the user must know
                    WHAT they're missing for the lock to create desire. */}
                <p className="text-sm text-white font-medium leading-tight">
                  {f.title}
                </p>
                {/* Impact/effort detail: crisp when unlocked, real-but-BLURRED
                    (blur-sm) when locked so the free user sees the shape of the
                    content they're missing without being able to read it. */}
                {/* The WHY — the business reason, in the owner's terms. This
                    is the difference between a checklist and an argument they
                    can act on, so it's part of the paid "cure": blurred for
                    locked rows exactly like the impact/effort detail. */}
                {f.evidence?.trim() && !locked && (
                  <p className="mt-1.5 text-xs leading-relaxed text-white/45">
                    <span className="text-white/60">{t("fixTracks.evidenceLabel")}</span>{" "}
                    {f.evidence}
                  </p>
                )}
                {f.theme_slug && !locked && themeBySlug(f.theme_slug) && (
                  <a
                    href={themeBySlug(f.theme_slug)!.url}
                    target="_blank"
                    rel="noopener nofollow"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-signal-300 hover:underline"
                  >
                    {t("fixTracks.themeLabel")}: {themeBySlug(f.theme_slug)!.name} ({t("fixTracks.themeFree")})
                    <ExternalLink className="size-3" />
                  </a>
                )}
                {f.why?.trim() && (
                  <p
                    className={cn(
                      "mt-1.5 text-xs leading-relaxed text-white/55",
                      locked && "select-none blur-sm pointer-events-none",
                    )}
                    aria-hidden={locked || undefined}
                  >
                    {f.why}
                  </p>
                )}
                <div
                  className={cn(
                    "mt-1.5 flex items-center gap-2",
                    locked && "select-none blur-sm pointer-events-none",
                  )}
                  aria-hidden={locked || undefined}
                >
                  <Badge
                    variant={
                      f.impact === "high"
                        ? "danger"
                        : f.impact === "medium"
                          ? "warning"
                          : "default"
                    }
                  >
                    {f.impact} {t("topFixes.impact")}
                  </Badge>
                  <span className="text-[10px] text-white/30">·</span>
                  <span className="text-[10px] text-white/50">
                    {t("topFixes.effort")}{" "}
                    {f.effort === "S" ? t("topFixes.effortS") : f.effort === "M" ? "1-4h" : t("topFixes.effortL")}
                  </span>
                </div>
                {locked && (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-champagne-300/80">
                    <Lock className="size-3" />
                    {t("topFixes.unlockHow")}
                  </div>
                )}
              </div>
              {locked ? (
                <Lock className="mt-0.5 size-4 shrink-0 text-white/20" />
              ) : (
                <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-white/20" />
              )}
            </motion.li>
          );
        })}
      </ol>
      {children}

      {/* Free-tier upsell footer — counter of what's still locked + CTA. */}
      {lockedCount > 0 && (
        <div className="mt-4 rounded-xl border border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.05] to-signal-600/[0.04] p-4 text-center">
          <p className="text-sm font-medium text-white">
            {fill(t(lockedCount === 1 ? "topFixes.moreOne" : "topFixes.moreMany"), {
              n: lockedCount,
            })}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-white/55 leading-relaxed">
            {t("topFixes.firstFree")}
          </p>
          <Link href="/app/checkout?plan=pro&interval=month" className="mt-3 inline-block">
            <Button variant="primary" size="sm">
              <Sparkles className="size-4" />
              {t("topFixes.unlockPrice")}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      )}
    </Card>
  );
}
