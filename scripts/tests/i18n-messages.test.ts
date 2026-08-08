import { test } from "node:test";
import assert from "node:assert/strict";
import { messages, translator } from "../../lib/i18n/messages";

/**
 * Guard: nothing else imports messages.ts in the test suite, so a syntax slip
 * or a key present in one locale but not the other used to sail past `npm test`
 * and only blow up at build. This locks the contract for the brief's report
 * copy (§1.3/§3) in BOTH locales.
 */

const REPORT_KEYS = ["disclaimer", "mapIntro", "rerunCta", "mapBandsLegend"] as const;

test("report copy exists in both locales (en + es)", () => {
  for (const locale of ["en", "es"] as const) {
    const report = (messages[locale] as Record<string, Record<string, unknown>>)
      .report;
    assert.ok(report, `[${locale}] missing report namespace`);
    for (const key of REPORT_KEYS) {
      const value = report[key];
      assert.equal(
        typeof value,
        "string",
        `[${locale}] report.${key} must be a non-empty string`,
      );
      assert.ok((value as string).length > 0, `[${locale}] report.${key} is empty`);
    }
  }
});

test("translator resolves the potential-bands legend in both locales", () => {
  for (const locale of ["en", "es"] as const) {
    const t = translator(locale);
    const legend = t("report.mapBandsLegend");
    // A resolved value differs from the raw path (translator returns the path on
    // a miss), and the en/es copy makes the potential-not-revenue point.
    assert.notEqual(legend, "report.mapBandsLegend");
    assert.match(legend, locale === "en" ? /potential/i : /potencial/i);
  }
});
