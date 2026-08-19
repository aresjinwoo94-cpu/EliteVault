import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messages } from "../../lib/i18n/messages";

/**
 * WP-E — "The Wall" / "El Muro" was internal shorthand borrowed from HBR
 * research on stalled growth. EliteVault is new; nobody arrives knowing the
 * term, so as a label it explained nothing. The visible copy now says what it
 * means, and the HBR statistic stays because that part is evidence.
 *
 * The distinction this file defends: the term is banned from RENDERED TEXT, and
 * deliberately kept in identifiers, comments and test names (`WALL_AFTER_INDEX`,
 * `crossedWall`, `atWallEdge`, the `wallPrefix` key). Renaming those would be
 * pure risk with no reader-facing benefit, so a naive repo-wide grep would be
 * the wrong guard — this one strips comments first and only reads what ships.
 */

const ROOT = process.cwd();

/** Files whose string content reaches a user's screen. */
const RENDER_SURFACES = [
  "lib/i18n/messages.ts",
  "lib/growth-map/phrase-bank.ts",
  "components/analyzer/growth-map/growth-map.tsx",
  "components/analyzer/growth-map/map-canvas.tsx",
  "components/analyzer/growth-map/node-card.tsx",
];

/**
 * Remove block and line comments so code notes don't count as copy.
 *
 * Trailing comments count too — the first run of this test caught
 * `{ x: 470, y: 140 }, // Silver (dip = The Wall)`, which a full-line-only
 * strip would have reported as shipped copy. The `(?<!:)` guard keeps `https://`
 * inside string literals from being mistaken for the start of a comment.
 */
function strippedSource(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, "");
}

test("no rendered copy says 'The Wall' or 'El Muro'", () => {
  const offenders: string[] = [];
  for (const file of RENDER_SURFACES) {
    const src = strippedSource(file);
    src.split("\n").forEach((line, i) => {
      if (/the wall|el muro/i.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `jargon still reaches the screen:\n${offenders.join("\n")}`);
});

test("the identifiers that were deliberately left alone are still intact", () => {
  // Guards the guard from over-correction: if a later cleanup renames these,
  // it breaks map placement and the movement diff for no user benefit.
  const placement = readFileSync(join(ROOT, "lib/growth-map/placement.ts"), "utf8");
  const ranks = readFileSync(join(ROOT, "lib/growth-map/ranks.ts"), "utf8");
  assert.match(ranks, /WALL_AFTER_INDEX/);
  assert.match(placement, /atWallEdge/);
});

test("the HBR evidence survived the rename — only the jargon went", () => {
  // The 87% figure is a real finding, not branding. Losing it while removing
  // the label would quietly weaken the report's credibility.
  const phrases = readFileSync(join(ROOT, "lib/growth-map/phrase-bank.ts"), "utf8");
  assert.match(phrases, /87%/);
  assert.match(phrases, /HBR/);
});

test("the stall copy exists in both locales and reads as plain language", () => {
  for (const locale of ["en", "es"] as const) {
    const report = (messages[locale] as Record<string, Record<string, unknown>>)
      .report;
    for (const key of ["wallPrefix", "wallOneStep", "wallCrossed", "movementAdvanced", "youreAtPrefix"]) {
      const value = report[key];
      assert.equal(typeof value, "string", `[${locale}] report.${key} missing`);
      assert.ok((value as string).length > 0, `[${locale}] report.${key} is empty`);
      assert.doesNotMatch(
        value as string,
        /the wall|el muro/i,
        `[${locale}] report.${key} still carries the old jargon`,
      );
    }
  }
});

test("the Spanish locale no longer inherits English for the map hooks", () => {
  // The bug WP-E fixed: these three strings were hardcoded in growth-map.tsx and
  // never passed through t(), so a Spanish reader saw English regardless of
  // locale. Different values per locale is the observable proof they're keyed.
  const en = (messages.en as Record<string, Record<string, unknown>>).report;
  const es = (messages.es as Record<string, Record<string, unknown>>).report;
  for (const key of ["wallOneStep", "wallCrossed", "movementAdvanced", "youreAtPrefix"]) {
    assert.notEqual(
      es[key],
      en[key],
      `report.${key} is identical in both locales — is it really translated?`,
    );
  }
});

test("WP-D: growth-map.tsx no longer renders the 'what changed' banner", () => {
  const src = strippedSource("components/analyzer/growth-map/growth-map.tsx");
  for (const key of ["changedSince", "changedResolved", "changedNew", "changedStageLine"]) {
    assert.doesNotMatch(
      src,
      new RegExp(key),
      `growth-map.tsx still references report.${key}`,
    );
  }
});
