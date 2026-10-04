import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { messages } from "../../lib/i18n/messages";

/**
 * The Spanish UI must be complete: with the automatic language on, a missing
 * Spanish key would silently show English in the middle of a Spanish screen.
 *   • every English key has a Spanish value, and vice versa;
 *   • {placeholders} and <tags> match between the two (a lost {n} or <b> breaks
 *     a sentence);
 *   • scripts/i18n-audit.mjs — which lists user-visible literals that bypass
 *     t() in the product UI — reports 0.
 */

function flatten(o: unknown, prefix = ""): Record<string, string> {
  if (typeof o === "string") return { [prefix]: o };
  if (typeof o !== "object" || o === null) return {};
  return Object.entries(o).reduce(
    (acc, [k, v]) => ({ ...acc, ...flatten(v, prefix ? `${prefix}.${k}` : k) }),
    {} as Record<string, string>,
  );
}

const en = flatten(messages.en);
const es = flatten(messages.es);

test("every English key has a Spanish translation, and vice versa", () => {
  const missingEs = Object.keys(en).filter((k) => !(k in es));
  const extraEs = Object.keys(es).filter((k) => !(k in en));
  assert.deepEqual(missingEs, [], `keys missing in es:\n${missingEs.join("\n")}`);
  assert.deepEqual(extraEs, [], `keys only in es:\n${extraEs.join("\n")}`);
});

test("a translation is empty only where the English is intentionally empty", () => {
  for (const k of Object.keys(en)) {
    assert.equal(es[k].trim().length === 0, en[k].trim().length === 0, `${k}: empty in only one language`);
  }
});

test("{placeholders} and <tags> match between en and es", () => {
  const sig = (s: string) =>
    [
      ...(s.match(/\{\w+\}/g) ?? []),
      ...(s.match(/<\/?\w+>/g) ?? []),
    ]
      .sort()
      .join(",");
  const bad: string[] = [];
  for (const k of Object.keys(en)) {
    if (k in es && sig(en[k]) !== sig(es[k])) {
      bad.push(`${k}: en [${sig(en[k])}] vs es [${sig(es[k])}]`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("scripts/i18n-audit.mjs reports no untranslated literal in the product UI", () => {
  const root = join(__dirname, "..", "..");
  const r = spawnSync(process.execPath, ["scripts/i18n-audit.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, `i18n audit found literals that bypass t():\n${r.stdout}${r.stderr}`);
});
