import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * No block may take the page down.
 *
 * A server action that THROWS does not return an error to the caller — Next
 * turns it into the error boundary, and the merchant sees "Something broke"
 * with their work apparently gone. An action that RETURNS `{ok:false}` shows a
 * toast and leaves them exactly where they were.
 *
 * This was not hypothetical: `requestBlocksPreview` called `inngest.send`
 * unguarded, so any network failure reaching the queue — a dev server that
 * wasn't running, a stale event key, a transient 5xx — blew up the whole page.
 * It was reported as a "trust icons" bug because that is what the reporter
 * happened to click; it affected every block type and the fresh-project
 * auto-dispatch too, because the failure had nothing to do with blocks at all.
 *
 * The rule this file enforces: every exported action in the Liquid Blocks
 * surface has a top-level try/catch, so an unexpected throw becomes a returned
 * error. Static, and honest about that — it cannot prove the catch is correct,
 * only that there is no path with no catch at all, which is the failure mode
 * that actually happened.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function codeOf(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Body of one function, by brace matching past its params and return type. */
function bodyOf(src: string, fnName: string): string {
  const at = src.search(
    new RegExp(`(?:export\\s+)?async\\s+function\\s+${fnName}\\b`),
  );
  if (at === -1) return "";
  let paren = 0;
  let angle = 0;
  let open = -1;
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === "<") angle++;
    else if (c === ">") angle = Math.max(0, angle - 1);
    else if (c === "{" && paren === 0 && angle === 0) {
      open = i;
      break;
    }
  }
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

/** Every app/actions/blocks*.ts module. Globbed, not listed. */
function blocksActionFiles(): string[] {
  return readdirSync(join(ROOT, "app", "actions"))
    .filter((f) => /^blocks.*\.ts$/.test(f))
    .map((f) => join("app", "actions", f));
}

test("there are Blocks action modules to check", () => {
  const files = blocksActionFiles();
  assert.ok(files.length >= 4, `found only ${files.length}: ${files.join(", ")}`);
});

test("every Blocks server action guards its whole body", () => {
  for (const file of blocksActionFiles()) {
    const src = codeOf(read(file));
    const names = [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
    assert.ok(names.length > 0, `${file} exports no actions — the check is vacuous`);

    for (const name of names) {
      const body = bodyOf(src, name);
      assert.ok(
        body.includes("try {"),
        `${file}: ${name}() has no try/catch. An action that throws becomes the ` +
          `error boundary — the merchant sees "Something broke" instead of a ` +
          `message they can act on.`,
      );

      /**
       * The try must be the FIRST statement, not merely present.
       *
       * This test is named "guards its whole body" and previously only checked
       * that a `try` existed somewhere. An action written as
       * `const supabase = await createSupabaseServerClient(); try { … }` would
       * have satisfied it while leaving the one call most likely to throw —
       * client construction, `cookies()`, a missing env var — outside the guard.
       * That is precisely the shape the original crash had.
       */
      const beforeTry = body.slice(1, body.indexOf("try {")).trim();
      assert.equal(
        beforeTry,
        "",
        `${file}: ${name}() runs code BEFORE its try block:\n    ${beforeTry.split("\n")[0]}\n` +
          `  Anything above the guard can still throw and take the page down.`,
      );
      assert.ok(
        /catch\s*\(/.test(body),
        `${file}: ${name}() has a try with no catch.`,
      );
    }
  }
});

test("the queue dispatch in particular cannot escape as an exception", () => {
  // The specific regression. `inngest.send` is a network call, and every reason
  // it fails — a dev server that isn't running, a stale event key, a transient
  // 5xx — is outside the merchant's control and outside ours.
  const src = codeOf(read("app/actions/blocks-preview.ts"));

  // The work moved into a helper, so the assertion is about REACHABILITY: the
  // send must live somewhere only the guarded action can reach.
  const action = bodyOf(src, "requestBlocksPreview");
  const helper = bodyOf(src, "dispatchPreview");
  assert.ok(helper.includes("inngest.send"), "the dispatch is gone — update this test");
  assert.ok(
    !action.includes("inngest.send"),
    "the send is inlined in the action; keep it behind the guarded helper",
  );

  const tryAt = action.indexOf("try {");
  const call = action.indexOf("dispatchPreview(");
  assert.ok(tryAt !== -1, "the action has no try block");
  assert.ok(tryAt < call, "the helper is called outside the try block");

  // And nothing else may call the helper from outside that guard. The
  // declaration is excluded — matching it counted the helper as its own caller.
  const callers = [...src.matchAll(/(?<!function\s)\bdispatchPreview\(/g)].length;
  assert.equal(callers, 1, `dispatchPreview is called from ${callers} places`);
});

test("the guard would catch an unguarded action", () => {
  // Guards the guard: a bodyOf that returned "" would make every assertion
  // above vacuously true, and this file would be decoration.
  const synthetic = `
    export async function safe(a: string): Promise<{ ok: boolean }> {
      try { return { ok: true }; } catch { return { ok: false }; }
    }
    export async function unsafe(a: string): Promise<{ ok: boolean }> {
      await fetch(a);
      return { ok: true };
    }
  `;
  assert.ok(bodyOf(synthetic, "safe").includes("try {"));
  assert.ok(!bodyOf(synthetic, "unsafe").includes("try {"));
  assert.ok(bodyOf(synthetic, "unsafe").includes("await fetch"));
});
