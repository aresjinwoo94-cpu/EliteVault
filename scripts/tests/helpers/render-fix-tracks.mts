/**
 * Server-renders the REAL <FixTracks> for a set of viewers and prints { caseName: html } as JSON.
 *
 * Runs in its own process because the shared test runner uses `--conditions=react-server`, under which
 * every `react-dom/server` entry point throws. Used by scripts/tests/fix-tracks-preselect.test.ts —
 * not a test file itself.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "../../../components/i18n/locale-provider";
import { FixTracks } from "../../../components/analyzer/fix-tracks";
import { messages } from "../../../lib/i18n/messages";

const FIXES = [
  { title: "Fix the hero headline", impact: "high" as const, effort: "S" as const, why: "WHY-ONE" },
  { title: "Add trust badges near the CTA", impact: "medium" as const, effort: "M" as const, why: "WHY-TWO" },
  { title: "Compress the product images", impact: "low" as const, effort: "S" as const, why: "WHY-THREE" },
];

type Props = { isPaid: boolean; isAnon: boolean; initialChoice: "post_purchase" | null };

function render(locale: "en" | "es", props: Props): string {
  const m = messages[locale] as unknown as Record<string, unknown>;
  const dict = { fixTracks: m.fixTracks, topFixes: m.topFixes } as never;
  return renderToStaticMarkup(
    createElement(
      LocaleProvider,
      { locale, messages: dict },
      createElement(FixTracks, { analysisId: "a1", urgentFixes: FIXES, competitorAvailable: true, ...props }),
    ),
  );
}

const cases: Record<string, Props> = {
  anon: { isPaid: false, isAnon: true, initialChoice: null },
  free: { isPaid: false, isAnon: false, initialChoice: null },
  freeSpent: { isPaid: false, isAnon: false, initialChoice: "post_purchase" },
  paid: { isPaid: true, isAnon: false, initialChoice: null },
};

const out: Record<string, string> = {};
for (const locale of ["en", "es"] as const) for (const [k, p] of Object.entries(cases)) out[`${locale}:${k}`] = render(locale, p);
process.stdout.write("\n@@JSON@@" + JSON.stringify(out));
