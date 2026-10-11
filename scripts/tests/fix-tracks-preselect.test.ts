import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { messages } from "../../lib/i18n/messages";

/**
 * What a viewer sees the moment the report loads (the server render IS the initial state, before any
 * click): "Most urgent" is SELECTED with its fixes visible — #1 open, the rest titled but blurred —
 * for anonymous and free viewers alike. Pro/Scale are unchanged. Nothing is fetched on load.
 *
 * The real component is rendered by scripts/tests/helpers/render-fix-tracks.mts in a child process
 * (the shared runner's `react-server` condition forbids `react-dom/server`).
 */

const ROOT = resolve(import.meta.dirname, "../..");
const run = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsx", "--tsconfig", "scripts/tests/tsconfig.json", "scripts/tests/helpers/render-fix-tracks.mts"],
  { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", timeout: 120_000, maxBuffer: 20 * 1024 * 1024 },
);
const raw = run.stdout.split("@@JSON@@")[1];
if (!raw) throw new Error(`render helper failed (status ${run.status}): ${run.stderr.slice(0, 800)}`);
const HTML = JSON.parse(raw) as Record<string, string>;

const tab = (html: string, id: string) => html.match(new RegExp(`<button[^>]*id="fix-tab-${id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? "";
const openTag = (html: string, id: string) => html.match(new RegExp(`<button[^>]*id="fix-tab-${id}"[^>]*>`))?.[0] ?? "";

for (const locale of ["en", "es"] as const) {
  const t = messages[locale] as unknown as { fixTracks: { pickPrompt: string; lockedTitle: string } };

  for (const [key, label] of [
    ["anon", "anonymous"],
    ["free", "free (signed in)"],
  ] as const) {
    test(`[${locale}] ${label}: "Most urgent" is selected on load with its fixes visible (#1 open, the rest blurred)`, () => {
      const html = HTML[`${locale}:${key}`];
      assert.ok(html, "rendered");
      assert.match(openTag(html, "urgent"), /aria-selected="true"/);
      for (const other of ["post_purchase", "theme_colors", "competitor"]) {
        assert.match(openTag(html, other), /aria-selected="false"/, other);
        assert.doesNotMatch(tab(html, other), /lucide-lock/, `${other}: no lock before any pick is spent`);
      }
      // fix #1 fully readable; #2 and #3 titled but blurred
      assert.match(html, /Fix the hero headline/);
      assert.match(html, /<p[^>]*>WHY-ONE<\/p>/);
      assert.doesNotMatch(html, /<p[^>]*blur-sm[^>]*>WHY-ONE<\/p>/);
      assert.match(html, /Add trust badges near the CTA/);
      assert.match(html, /Compress the product images/);
      assert.match(html, /<p[^>]*blur-sm[^>]*>WHY-TWO<\/p>/);
      assert.match(html, /<p[^>]*blur-sm[^>]*>WHY-THREE<\/p>/);
      // the reminder that ONE more type is included, and no lock/pick screen
      assert.ok(html.includes(t.fixTracks.pickPrompt), "reminder: pick one of the others");
      assert.ok(!html.includes(t.fixTracks.lockedTitle), "no locked screen");
    });
  }

  test(`[${locale}] a free viewer who already spent the pick lands on it; urgent stays reachable and unlocked`, () => {
    const html = HTML[`${locale}:freeSpent`];
    assert.match(openTag(html, "post_purchase"), /aria-selected="true"/);
    assert.match(openTag(html, "urgent"), /aria-selected="false"/);
    assert.doesNotMatch(tab(html, "urgent"), /lucide-lock/, "urgent never shows a lock");
    assert.match(tab(html, "theme_colors"), /lucide-lock/, "the other two are locked");
    assert.match(tab(html, "competitor"), /lucide-lock/);
  });

  test(`[${locale}] Pro/Scale unchanged: urgent selected, everything open, no locks, no reminder`, () => {
    const html = HTML[`${locale}:paid`];
    assert.match(openTag(html, "urgent"), /aria-selected="true"/);
    assert.doesNotMatch(html, /lucide-lock/);
    assert.doesNotMatch(html, /blur-sm/);
    for (const w of ["WHY-ONE", "WHY-TWO", "WHY-THREE"]) assert.match(html, new RegExp(w));
    assert.ok(!html.includes(t.fixTracks.pickPrompt));
  });
}
