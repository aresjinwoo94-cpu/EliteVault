/**
 * Server-renders the REAL "How many visitors buy" card and the Meta Ads Optimizer targets in EN and ES and prints
 * { case: html } as JSON (own process: the shared runner's `react-server` condition forbids react-dom/server).
 * Used by scripts/tests/analyzer-metrics-clarity.test.ts — not a test file itself.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "../../../components/i18n/locale-provider";
import { ConversionGauges } from "../../../components/analyzer/conversion-gauges";
import { MetaAdsOptimizer } from "../../../components/analyzer/meta-ads-optimizer";
import { LockedMetaAdsPreview } from "../../../components/analyzer/scale-locked-preview";
import { messages } from "../../../lib/i18n/messages";

const META = {
  niche: "skincare",
  audience_seed: "Women 25-44",
  budget_band: { daily_min: 30, daily_max: 60, currency: "USD" as const },
  targets: { cpc: 1.2, cpm: 18, ctr: 0.015, roas: 1.6, cvr: 0.021 },
  creatives: [],
  targeting: { interests: [], custom_audiences: [], exclusions: [] },
  testing_plan: [],
  caveats: [],
};

const out: Record<string, string> = {};
for (const locale of ["en", "es"] as const) {
  const m = messages[locale] as unknown as Record<string, unknown>;
  const dict = { gauges: m.gauges, optimizer: m.optimizer, simulator: m.simulator, scaleLocked: m.scaleLocked } as never;
  const wrap = (node: ReturnType<typeof createElement>) => createElement(LocaleProvider, { locale, messages: dict }, node);
  out[`${locale}:gauges`] = renderToStaticMarkup(wrap(createElement(ConversionGauges, { score: 62, niche: "skincare" })));
  out[`${locale}:optimizer`] = renderToStaticMarkup(wrap(createElement(MetaAdsOptimizer, { meta: META })));
  out[`${locale}:locked`] = renderToStaticMarkup(wrap(createElement(LockedMetaAdsPreview)));
}
process.stdout.write("\n@@JSON@@" + JSON.stringify(out));
