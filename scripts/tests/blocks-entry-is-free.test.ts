import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The preview is free. This is the test that keeps it that way.
 *
 * It is a STATIC check over source, in the same spirit as
 * migrations-idempotent.test.ts, and it's honest about that: it can't prove the
 * action doesn't charge, only that the module has no machinery to charge WITH.
 * That's the property worth locking, because the risk isn't a subtle bug — it's
 * WP-D adding an export charge and someone later "tidying up" by moving the
 * deduction earlier, into the entry path, where it would silently turn the hook
 * into a paywall.
 *
 * The architecture is what makes the check meaningful: entry (free) and export
 * (10 credits) live in SEPARATE modules on purpose, so "this file has no credit
 * code in it" stays a true and checkable statement rather than something that
 * dissolves the moment both paths share a file.
 *
 * If a future work package legitimately needs to charge at entry, this test
 * should be deleted with an explanation — not weakened until it passes.
 */

const ENTRY_MODULE = join(process.cwd(), "app", "actions", "blocks.ts");

/** Strip comments so the prose explaining the rule can't trip the rule. */
function codeOf(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const source = codeOf(readFileSync(ENTRY_MODULE, "utf8"));

test("the entry module cannot deduct credits", () => {
  for (const forbidden of ["credits", "assertQuota", "LIQUID_EXPORT_COST"]) {
    assert.ok(
      !source.includes(forbidden),
      `app/actions/blocks.ts references \`${forbidden}\` — the preview is free; ` +
        `the charge belongs in the export module (WP-D).`,
    );
  }
});

test("the entry module cannot queue background work", () => {
  // Not a cost rule but the same class of promise: creating a project is a
  // validate-and-insert, and the brief's acceptance criterion is that a rejected
  // URL fires no Inngest event. Keeping the import out is the cheapest way that
  // stays true.
  assert.ok(
    !source.includes("inngest"),
    "app/actions/blocks.ts imports Inngest — WP-A's contract is that entry " +
      "queues nothing; the preview job is dispatched from its own path.",
  );
});

test("the guard would actually catch a violation", () => {
  // Guards the guard: a broken `codeOf` that returned "" would make every
  // assertion above vacuously true.
  const violating = codeOf(`
    // this comment mentions credits and should be ignored
    const { data } = await supabase.from("profiles").select("credits");
  `);
  assert.ok(violating.includes("credits"));
  assert.ok(!codeOf("// credits\n/* assertQuota */").includes("assertQuota"));
});
