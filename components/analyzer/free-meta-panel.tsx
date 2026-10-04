"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Scale, Flame, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { roasRangeForAudit } from "@/lib/meta/roas-range";
import { useT } from "@/components/i18n/locale-provider";
import { Rich } from "@/components/i18n/rich";
import { fill } from "@/lib/i18n/lookup";

/**
 * Free post-audit Meta panel (Fase 2 P0-3).
 *
 * Shown to a FREE user right under their score, in-page (never a modal that
 * covers the report they just waited for). It turns the moment of maximum
 * intent — "the audit just finished" — into a concrete, honest Meta
 * opportunity, and routes it to Pro.
 *
 * HONESTY RULES baked in (do not soften):
 *   • We NEVER claim the store "will" hit a ROAS. We show a RANGE that stores
 *     with a similar structural profile model into, with an adjacent
 *     disclaimer. The range is derived from the real audit score + niche
 *     (see lib/meta/roas-range.ts) — reproducible, not random, not hardcoded.
 *   • When the honest range is bad (weak store), we SHOW it and flip the
 *     headline to the "not ready to scale" framing with a CTA to the fixes.
 *     A precise bad diagnosis converts better than false optimism.
 *   • No countdowns, no fake scarcity, no exclamation-mark hype.
 *
 * It's server-rendered on the report page, so it's naturally persistent
 * across reloads and appears once per audit.
 */
export function FreeMetaPanel({
  score,
  niche,
  hideScore = false,
}: {
  score: number;
  niche: string;
  /**
   * analyzer-report-redesign brief §A.2 — the v2 report never paints the 0–100,
   * so drop the "with a score of N/100" clause. The ROAS range is still derived
   * from the score internally (brief §A.3); we just stop naming the number.
   */
  hideScore?: boolean;
}) {
  const { t } = useT();
  const range = roasRangeForAudit(score, niche);
  const roundedScore = Math.round(score > 1 ? score : score * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <Card className="relative overflow-hidden border-signal-500/20 bg-gradient-to-br from-signal-600/[0.06] to-champagne-400/[0.04] p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-signal-600/12 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_360px] lg:items-center">
          {/* Copy side */}
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-signal-300" />
              <span className="text-[10px] uppercase tracking-widest text-white/45">
                {t("freeMeta.title")}
              </span>
            </div>

            {range.ready ? (
              <>
                <h3 className="mt-3 font-serif text-2xl md:text-3xl tracking-tight text-white">
                  {t("freeMeta.modelable")}
                </h3>
                {/* v2 drops the "with a score of N/100" clause. The non-v2
                    paragraph is the ORIGINAL markup verbatim (one text flow), so
                    the flag-off render stays byte-identical. */}
                {hideScore ? (
                  <p className="mt-3 max-w-xl text-sm md:text-base text-white/70 leading-relaxed">
                    <Rich
                      text={fill(t("freeMeta.okNoScore"), { range: `ROAS ${range.low.toFixed(1)}× – ${range.high.toFixed(1)}×` })}
                      tags={{ s: (c) => <span className="font-medium text-signal-200">{c}</span> }}
                    />
                  </p>
                ) : (
                  <p className="mt-3 max-w-xl text-sm md:text-base text-white/70 leading-relaxed">
                    <Rich
                      text={fill(t("freeMeta.okScore"), { score: roundedScore, range: `ROAS ${range.low.toFixed(1)}× – ${range.high.toFixed(1)}×` })}
                      tags={{
                        w: (c) => <span className="font-medium text-white">{c}</span>,
                        s: (c) => <span className="font-medium text-signal-200">{c}</span>,
                      }}
                    />
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 className="mt-3 font-serif text-2xl md:text-3xl tracking-tight text-white">
                  {t("freeMeta.notReady")}
                </h3>
                {hideScore ? (
                  <p className="mt-3 max-w-xl text-sm md:text-base text-white/70 leading-relaxed">
                    <Rich
                      text={fill(t("freeMeta.lowNoScore"), { range: `ROAS ${range.low.toFixed(1)}× – ${range.high.toFixed(1)}×` })}
                      tags={{ s: (c) => <span className="font-medium text-warning">{c}</span> }}
                    />
                  </p>
                ) : (
                  <p className="mt-3 max-w-xl text-sm md:text-base text-white/70 leading-relaxed">
                    <Rich
                      text={fill(t("freeMeta.lowScore"), { score: roundedScore, range: `ROAS ${range.low.toFixed(1)}× – ${range.high.toFixed(1)}×` })}
                      tags={{
                        w: (c) => <span className="font-medium text-white">{c}</span>,
                        s: (c) => <span className="font-medium text-warning">{c}</span>,
                      }}
                    />
                  </p>
                )}
              </>
            )}

            <p className="mt-4 max-w-xl text-sm text-white/55 leading-relaxed">
              {t("freeMeta.includes")}
            </p>

            <p className="mt-3 text-xs italic text-white/40">
              {t("freeMeta.rangeNote")}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/app/checkout?plan=pro&interval=month">
                <Button variant="primary" size="lg">
                  <Sparkles className="size-4" />
                  {range.ready
                    ? t("freeMeta.unlockProj")
                    : t("freeMeta.unlockBoth")}
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link
                href="/pricing"
                className="text-sm text-white/55 underline-offset-4 hover:text-white/80 hover:underline"
              >
                {t("freeMeta.included")}
              </Link>
            </div>
          </div>

          {/* Blurred preview of the real Meta block — the user sees the SHAPE
              of what they're missing (3 scenario cards) with legible titles. */}
          <div
            aria-hidden
            className="relative hidden lg:block"
          >
            <div className="grid grid-cols-3 gap-2 opacity-70 blur-[3px]">
              {[
                { label: t("simulator.scCons"), Icon: Shield, tint: "text-sky-300" },
                { label: t("simulator.scBal"), Icon: Scale, tint: "text-champagne-300" },
                { label: t("simulator.scAggr"), Icon: Flame, tint: "text-rose-300" },
              ].map(({ label, Icon, tint }) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
                >
                  <Icon className={`size-3.5 ${tint}`} />
                  <div className="mt-3 h-6 w-12 rounded bg-white/15" />
                  <div className="mt-2 h-1.5 w-full rounded bg-white/[0.08]" />
                  <div className="mt-1 h-1.5 w-3/4 rounded bg-white/[0.08]" />
                  <div className="mt-3 h-8 w-full rounded bg-white/[0.05]" />
                </div>
              ))}
            </div>
            {/* Legible scenario titles float over the blur so the value is
                unmistakable even though the numbers are hidden. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-around text-[10px] uppercase tracking-widest text-white/70">
              <span>{t("simulator.scCons")}</span>
              <span>{t("simulator.scBal")}</span>
              <span>{t("simulator.scAggr")}</span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
