"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataPill } from "@/components/ui/data-pill";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * "How EliteVault compares" — capability table vs. real competitors in the
 * AI CRO-audit category: ConvertMate, AuditMyStore, and a human CRO agency.
 *
 * We deliberately do NOT compare against Hotjar or Triple Whale — those are
 * continuous session/attribution analytics, a different category. An operator
 * who uses them reads such a comparison and concludes we don't understand the
 * space. These three actually overlap with what EliteVault does.
 *
 * HONESTY: the table is intentionally NOT a clean sweep. There are rows where
 * EliteVault loses on purpose (native Shopify integration, and actually
 * running A/B tests + implementing the fixes) — a table where one column wins
 * everything reads as an ad, not a comparison. The "What EliteVault does NOT
 * do" callout below makes the boundary explicit; naming the limitation kills
 * the objection before the buyer raises it.
 *
 * Placement: right after FeaturesShowcase and before Reviews/social proof.
 *
 * SEO note: rows render unconditionally (no whileInView gating), so every
 * cell ships in the server HTML — rankable comparison content.
 *
 * LEGAL note: competitor cells describe publicly known capabilities factually
 * (ConvertMate = Shopify-native AI CRO that auto-applies changes; AuditMyStore
 * = one-shot AI store audit; CRO agency = human audit + A/B testing). The
 * footnote dates the comparison. Keep cells verifiable — no disparagement.
 *
 * Mobile: the table scrolls horizontally inside its own container
 * (min-w + overflow-x-auto) — the page never scrolls sideways.
 */

type Cell = true | false | string; // string = i18n key for a nuanced cell

// cells order = [EliteVault, ConvertMate, AuditMyStore, CRO agency]
const ROWS: { labelKey: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  { labelKey: "compare.rowAudit", cells: [true, "compare.cellContinuous", true, "compare.cellDays"] },
  { labelKey: "compare.rowScreenshot", cells: [true, false, true, "compare.cellManual"] },
  { labelKey: "compare.rowPersona", cells: [true, false, false, false] },
  { labelKey: "compare.rowLibrary", cells: [true, false, false, false] },
  { labelKey: "compare.rowImageSearch", cells: [true, false, false, false] },
  { labelKey: "compare.rowMetaModeler", cells: [true, false, false, false] },
  { labelKey: "compare.rowNicheAware", cells: [true, false, "compare.cellPartial", true] },
  // ↓ Rows EliteVault loses on purpose — a real comparison, not an ad.
  { labelKey: "compare.rowShopify", cells: [false, true, false, true] },
  { labelKey: "compare.rowImplements", cells: [false, true, false, true] },
  {
    labelKey: "compare.rowNoInstall",
    cells: [true, "compare.cellNeedsApp", true, true],
  },
  {
    labelKey: "compare.rowPrice",
    cells: [
      "compare.cellPriceEv",
      "compare.cellPriceConvertmate",
      "compare.cellPriceAudit",
      "compare.cellPriceAgency",
    ],
  },
];

function CellContent({ cell }: { cell: Cell }) {
  const { t } = useT();
  if (cell === true) {
    return <Check className="mx-auto size-4 text-success" aria-label="Yes" />;
  }
  if (cell === false) {
    return <span className="text-white/25">—</span>;
  }
  return <span className="text-xs text-white/50">{t(cell)}</span>;
}

export function ComparisonTable() {
  const { t } = useT();
  const columns = [
    { key: "ev", label: "EliteVault", highlight: true },
    { key: "convertmate", label: "ConvertMate", highlight: false },
    { key: "auditmystore", label: "AuditMyStore", highlight: false },
    { key: "agency", label: t("compare.colAgency"), highlight: false },
  ];

  return (
    <section id="compare" className="relative py-20 md:py-28 border-t border-white/[0.04]">
      <div className="container max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="flex flex-col items-center text-center max-w-2xl mx-auto"
        >
          <DataPill items={["THE COMPARISON", "NO CONTEST"]} />
          <h2 className="mt-5 font-serif text-3xl md:text-5xl tracking-tight">
            {t("compare.heading")}
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed">
            {t("compare.subheading")}
          </p>
        </motion.div>

        {/* Table — horizontal scroll on narrow screens, page never breaks */}
        <div className="mt-12 overflow-x-auto rounded-2xl border border-white/[0.06] bg-card shadow-card">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="p-4 text-left font-normal text-white/40 text-xs uppercase tracking-wider">
                  {t("compare.colCapability")}
                </th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "p-4 text-center font-medium text-white w-[17%]",
                      c.highlight &&
                        "bg-signal-600/[0.07] border-x border-signal-500/15",
                    )}
                  >
                    <span className="inline-flex flex-col items-center gap-1.5">
                      {c.label}
                      {c.highlight && (
                        <span className="rounded-full bg-signal-600/15 px-2 py-0.5 text-[9px] font-medium uppercase tracking-widest text-signal-300 ring-1 ring-signal-500/25">
                          {t("compare.youAreHere")}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.labelKey}
                  className={cn(
                    "border-b border-white/[0.04]",
                    i === ROWS.length - 1 && "border-b-0",
                  )}
                >
                  <td className="p-4 text-white/75 leading-snug">
                    {t(row.labelKey)}
                  </td>
                  {row.cells.map((cell, j) => (
                    <td
                      key={j}
                      className={cn(
                        "p-4 text-center",
                        columns[j].highlight &&
                          "bg-signal-600/[0.07] border-x border-signal-500/15",
                        columns[j].highlight &&
                          typeof cell === "string" &&
                          "font-medium",
                      )}
                    >
                      {columns[j].highlight && typeof cell === "string" ? (
                        <span className="text-xs text-signal-200">{t(cell)}</span>
                      ) : (
                        <CellContent cell={cell} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* What EliteVault does NOT do — naming the boundary kills the
            objection before the buyer thinks it. This raises conversion,
            it doesn't lower it. */}
        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5 md:p-6">
          <p className="text-sm font-medium text-white">
            {t("compare.notDoTitle")}
          </p>
          <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
            {t("compare.notDoBody")}
          </p>
        </div>

        {/* Legal footnote — dates the comparison */}
        <p className="mt-3 text-center text-[11px] text-white/30">
          {t("compare.footnote")}
        </p>

        {/* Closing line + CTA */}
        <div className="mt-10 flex flex-col items-center gap-5 text-center">
          <p className="max-w-xl text-base md:text-lg text-white/70 leading-relaxed">
            {t("compare.closingPre")}{" "}
            <span className="text-white">{t("compare.closingBold")}</span>{" "}
            {t("compare.closingPost")}
          </p>
          <Button asChild size="lg">
            <Link href="/sign-up?next=/app/analyzer">
              {t("compare.cta")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
