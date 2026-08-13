import { test } from "node:test";
import assert from "node:assert/strict";
import { messages, translator } from "../../lib/i18n/messages";

/**
 * Guard: nothing else imports messages.ts in the test suite, so a syntax slip
 * or a key present in one locale but not the other used to sail past `npm test`
 * and only blow up at build. This locks the contract for the brief's report
 * copy (§1.3/§3) in BOTH locales.
 */

const REPORT_KEYS = [
  "disclaimer",
  "mapIntro",
  "rerunCta",
  "potentialTitle",
  "potentialBody",
  "rerunTitle",
  "rerunBody",
  // Master brief §B/§C/§D — the map-spine + issue-diff copy, both locales.
  "stageToNext",
  "stageProgressAria",
  "stageTopRank",
  "potentialBand",
  "leaksHeading",
  "leaksSub",
  "changedSince",
  "changedResolved",
  "changedNew",
  "changedStillOpen",
  "changedStageLine",
  "changedStageFlat",
  "climbHeading",
  "climbMoreFixes",
  "fixIndexHeading",
  "fixIndexHeadingTop",
  "lensFixes",
  "lensFixesHint",
  "lensAudit",
  "lensAuditHint",
  "lensLeaks",
  "wallPrefix",
  "wallAdReady",
  "wallAdAlmost",
  "wallAdNot",
] as const;

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

test("translator resolves the potential announcement in both locales", () => {
  for (const locale of ["en", "es"] as const) {
    const t = translator(locale);
    const title = t("report.potentialTitle");
    // A resolved value differs from the raw path (translator returns the path on
    // a miss), and the en/es copy makes the potential-not-revenue point.
    assert.notEqual(title, "report.potentialTitle");
    assert.match(title, locale === "en" ? /potential/i : /potencial/i);
  }
});
