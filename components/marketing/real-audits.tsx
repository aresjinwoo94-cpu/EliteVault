"use client";

import { motion } from "framer-motion";
import { ScanLine, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataPill } from "@/components/ui/data-pill";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * "Real audits" social-proof section (Fase 1 P0-1) — the honest replacement
 * for the empty review form that used to sit on the landing.
 *
 * ⚠️ NOT MOUNTED YET — do not add <RealAudits /> to app/page.tsx until the
 * placeholder data below is replaced with REAL captures from the analyzer.
 * Per the brief: build the component now, keep it out of the page until the
 * assets exist. Mounting it with the placeholder data would itself be a
 * "fake numbers" violation.
 *
 * TODO: reemplazar con capturas reales
 *   For each card, capture a REAL analyzer report and fill in:
 *     - `domain`      → the store's domain, ANONYMIZED (e.g. "sto•••••.com")
 *     - `score`       → the real overall score from that audit
 *     - `fixes`       → the top 2-3 fixes exactly as the report listed them
 *     - `screenshot`  → (optional) a real annotated-screenshot thumbnail URL
 *   Then mount <RealAudits /> in app/page.tsx (e.g. in place of / near the
 *   Reviews slot) and, if desired, move the copy into the i18n dictionary
 *   (en + es) instead of the inline strings here.
 */

interface RealAudit {
  /** Anonymized domain, e.g. "sto•••••.com" — never a real full domain. */
  domain: string;
  /** Real overall score (0-100) from the captured audit. */
  score: number;
  /** Top 2-3 fixes, verbatim from the real report. */
  fixes: string[];
  /** Optional real annotated-screenshot thumbnail. */
  screenshot?: string;
}

// TODO: reemplazar con capturas reales — placeholders below are NOT real.
const PLACEHOLDER_AUDITS: RealAudit[] = [
  {
    domain: "sto•••••.com",
    score: 62,
    fixes: [
      "TODO: real fix #1 from the captured audit",
      "TODO: real fix #2 from the captured audit",
      "TODO: real fix #3 from the captured audit",
    ],
  },
  {
    domain: "sho•••••.co",
    score: 74,
    fixes: [
      "TODO: real fix #1 from the captured audit",
      "TODO: real fix #2 from the captured audit",
    ],
  },
  {
    domain: "get•••••.com",
    score: 48,
    fixes: [
      "TODO: real fix #1 from the captured audit",
      "TODO: real fix #2 from the captured audit",
      "TODO: real fix #3 from the captured audit",
    ],
  },
];

function scoreTone(score: number): string {
  if (score >= 75) return "text-success";
  if (score >= 55) return "text-signal-300";
  return "text-warning";
}

export function RealAudits({
  audits = PLACEHOLDER_AUDITS,
}: {
  audits?: RealAudit[];
}) {
  return (
    <section className="relative py-20 md:py-28">
      <div className="container max-w-6xl">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
          <DataPill items={["REAL AUDITS", "STRAIGHT FROM THE ANALYZER"]} />
          <h2 className="mt-5 font-serif text-3xl md:text-5xl tracking-tight">
            Real reports, real fixes.
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed">
            Actual audits the analyzer produced — domains anonymized, scores and
            top fixes as generated. No testimonials, no stock praise: the work
            speaks.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {audits.map((a, i) => (
            <motion.div
              key={a.domain + i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, ease, delay: i * 0.08 }}
            >
              <Card className="h-full overflow-hidden p-0">
                {a.screenshot ? (
                  <div className="relative aspect-[4/3] overflow-hidden bg-obsidian-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.screenshot}
                      alt={`Audit report for ${a.domain}`}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover object-top"
                    />
                  </div>
                ) : (
                  <div className="relative grid aspect-[4/3] place-items-center bg-gradient-to-br from-obsidian-800 to-obsidian-900">
                    <div className="absolute inset-0 bg-dot-grid opacity-20" />
                    <ScanLine className="relative size-8 text-white/25" />
                    {/* TODO: reemplazar con captura real del reporte */}
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-sm text-white/70">{a.domain}</p>
                    <div className="text-right">
                      <span
                        className={`font-mono tabular-nums text-2xl leading-none ${scoreTone(
                          a.score,
                        )}`}
                      >
                        {a.score}
                      </span>
                      <span className="ml-1 text-xs text-white/40">/100</span>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {a.fixes.slice(0, 3).map((fix, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2 text-sm text-white/70 leading-snug"
                      >
                        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-signal-300" />
                        <span>{fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
