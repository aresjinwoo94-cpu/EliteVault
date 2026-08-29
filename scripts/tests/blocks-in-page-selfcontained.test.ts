import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every function handed to `page.evaluate` must be self-contained.
 *
 * puppeteer serializes the ONE function it is given and evaluates the resulting
 * source in the page. Anything that function references from module scope — a
 * constant, another helper — does not exist on the other side, and the call
 * throws `X is not defined` at runtime, on every store, for every user.
 *
 * This has now happened twice. `tokenSignature` called `collectDesignTokens`
 * and took down every preview until a live run caught it; the font work then
 * reached for module-scope helpers in the same way. Neither was catchable by a
 * unit test, because in Node the reference resolves perfectly — the failure
 * exists only across the serialization boundary. So the check is on the SOURCE.
 *
 * The file header states this rule in prose. Prose is not a guard.
 */

const SRC = join(process.cwd(), "lib/blocks/collect-tokens.ts");
const source = readFileSync(SRC, "utf8");

/**
 * Names declared at module scope in collect-tokens.ts — i.e. at zero
 * indentation. Anything nested is a local and travels with its function.
 */
function moduleScopeNames(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/^(?:export\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  return [...names];
}

/**
 * Strip comments and string literals before looking for references.
 *
 * Without this the scan reads prose. Its first run flagged
 * `collectDesignTokens` for the words "Cleared again by removeBlock" in a
 * comment — a guard that cries wolf on documentation gets switched off, and a
 * switched-off guard is how the bug it was written for comes back.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""');
}

/** The body of a top-level `export function NAME(...)`, brace-matched. */
function bodyOf(text: string, name: string): string {
  const at = text.indexOf(`export function ${name}(`);
  assert.notEqual(at, -1, `${name} is not an exported function in collect-tokens.ts`);
  const open = text.indexOf("{", text.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/**
 * Discovered from the callers rather than hard-coded, so a new
 * `page.evaluate(somethingNew)` is covered the day it is written instead of the
 * day someone remembers to add it here.
 */
function inPageFunctionNames(): string[] {
  const callers = [
    join(process.cwd(), "inngest/functions/blocks-preview.ts"),
    join(process.cwd(), "scripts/blocks-perf.mts"),
    ...readdirSync(join(process.cwd(), "scripts"))
      .filter((f) => f.startsWith("blocks-") && f.endsWith(".mts"))
      .map((f) => join(process.cwd(), "scripts", f)),
  ];
  const names = new Set<string>();
  for (const file of callers) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(
      /page\.(?:evaluate|waitForFunction)\(\s*([A-Za-z_$][\w$]*)/g,
    )) {
      // Inline arrow functions are fine — they close over nothing we ship.
      if (source.includes(`export function ${m[1]}(`)) names.add(m[1]);
    }
  }
  return [...names];
}

test("no in-page function references module scope", () => {
  const declared = moduleScopeNames(codeOnly(source));
  const inPage = inPageFunctionNames();

  assert.ok(
    inPage.length >= 5,
    `only found ${inPage.length} in-page functions — the caller scan is broken`,
  );

  for (const name of inPage) {
    const body = codeOnly(bodyOf(source, name));
    const leaked = declared.filter(
      (d) => d !== name && new RegExp(`\\b${d}\\b`).test(body),
    );
    assert.deepEqual(
      leaked,
      [],
      `${name}() is sent into the page but references module scope: ${leaked.join(", ")}. ` +
        `Those names do not exist there — inline them, or pass them as arguments.`,
    );
  }
});

test("the guard would catch the bug that produced it", () => {
  /**
   * Mutation check in-line: the real `tokenSignature` regression, replayed
   * against the same detector. Without this, a scan that silently matched
   * nothing would pass forever and read as coverage.
   */
  const fake = [
    'const HELPER_LIST = ["a"];',
    "export function collectDesignTokens() {",
    "  return HELPER_LIST.length;",
    "}",
  ].join("\n");
  const declared = moduleScopeNames(fake);
  const body = bodyOf(fake, "collectDesignTokens");
  const leaked = declared.filter(
    (d) => d !== "collectDesignTokens" && new RegExp(`\\b${d}\\b`).test(body),
  );
  assert.deepEqual(leaked, ["HELPER_LIST"]);
});
