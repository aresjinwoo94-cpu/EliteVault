"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Lock, Zap, Sparkles, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Fix {
  title: string;
  impact: "high" | "medium" | "low";
  effort: "S" | "M" | "L";
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
 */
export function TopFixes({
  fixes,
  unlockedCount = Infinity,
}: {
  fixes: Fix[];
  unlockedCount?: number;
}) {
  const total = fixes?.length ?? 0;
  const lockedCount = Math.max(0, total - unlockedCount);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="size-4 text-champagne-400" />
        <h3 className="text-sm font-medium">Top fixes — ranked by leverage</h3>
      </div>

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
                "flex items-center gap-3 rounded-xl border p-3.5 transition-colors",
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
                <div
                  className={cn(
                    "mt-1 flex items-center gap-2",
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
                    {f.impact} impact
                  </Badge>
                  <span className="text-[10px] text-white/30">·</span>
                  <span className="text-[10px] text-white/50">
                    Effort:{" "}
                    {f.effort === "S" ? "<1h" : f.effort === "M" ? "1-4h" : ">4h"}
                  </span>
                </div>
                {locked && (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-champagne-300/80">
                    <Lock className="size-3" />
                    Unlock impact &amp; how-to with Pro
                  </div>
                )}
              </div>
              {locked ? (
                <Lock className="size-4 text-white/20" />
              ) : (
                <ArrowUpRight className="size-4 text-white/20" />
              )}
            </motion.li>
          );
        })}
      </ol>

      {/* Free-tier upsell footer — counter of what's still locked + CTA. */}
      {lockedCount > 0 && (
        <div className="mt-4 rounded-xl border border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.05] to-signal-600/[0.04] p-4 text-center">
          <p className="text-sm font-medium text-white">
            +{lockedCount} more {lockedCount === 1 ? "fix" : "fixes"} — unlock
            with Pro
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-white/55 leading-relaxed">
            Your first fix is free. Pro reveals the full ranked action plan for
            this audit — instantly, no re-analysis — plus unlimited audits.
          </p>
          <Link href="/app/checkout?plan=pro&interval=month" className="mt-3 inline-block">
            <Button variant="primary" size="sm">
              <Sparkles className="size-4" />
              Unlock for $19 / mo
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      )}
    </Card>
  );
}
