/**
 * Server-renders the REAL locked-report surfaces with and without the unlock offer and prints { case: html }
 * as JSON (own process: the shared runner's `react-server` condition forbids react-dom/server).
 * Used by scripts/tests/report-unlock-ui.test.ts — not a test file itself.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "../../../components/i18n/locale-provider";
import { TopFixes } from "../../../components/analyzer/top-fixes";
import { FreeLockedCure } from "../../../components/analyzer/free-locked-cure";
import { UnlockOfferProvider } from "../../../components/analyzer/unlock-offer";
import { messages } from "../../../lib/i18n/messages";

const FIXES = [
  { title: "Fix one", impact: "high" as const, effort: "S" as const, why: "WHY-ONE" },
  { title: "Fix two", impact: "medium" as const, effort: "M" as const, locked: true },
  { title: "Fix three", impact: "low" as const, effort: "S" as const, locked: true },
];

function render(locale: "en" | "es", offer: { enabled: boolean; isAnon: boolean } | null): { fixes: string; cure: string } {
  const m = messages[locale] as unknown as Record<string, unknown>;
  const dict = { topFixes: m.topFixes, lockedCure: m.lockedCure, unlock: m.unlock, scaleLocked: m.scaleLocked, annotations: m.annotations } as never;
  const wrap = (node: ReturnType<typeof createElement>) =>
    createElement(
      LocaleProvider,
      { locale, messages: dict },
      offer
        ? createElement(UnlockOfferProvider, { enabled: offer.enabled, analysisId: "a1", isAnon: offer.isAnon, lockedFixes: 2, children: node })
        : node,
    );
  return {
    fixes: renderToStaticMarkup(wrap(createElement(TopFixes, { fixes: FIXES, unlockedCount: 1 }))),
    cure: renderToStaticMarkup(wrap(createElement(FreeLockedCure, { title: "Persona", tagline: "tag", children: createElement("p", null, "x") }))),
  };
}

const out: Record<string, { fixes: string; cure: string }> = {};
for (const locale of ["en", "es"] as const) {
  out[`${locale}:off`] = render(locale, null); // no provider at all (paid viewers, flag off)
  out[`${locale}:disabled`] = render(locale, { enabled: false, isAnon: false }); // provider present but flag off
  out[`${locale}:on`] = render(locale, { enabled: true, isAnon: false });
  out[`${locale}:anon`] = render(locale, { enabled: true, isAnon: true });
}
process.stdout.write("\n@@JSON@@" + JSON.stringify(out));
