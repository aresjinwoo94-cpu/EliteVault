import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { messages, clientMessages } from "../../lib/i18n/messages";
import { CLIENT_NAMESPACES } from "../../lib/i18n/client-namespaces";

/**
 * The browser gets ONE language and ONLY the namespaces client code reads
 * (clientMessages). That is what keeps translations from adding JS to every
 * page, so this guard has two jobs:
 *   • a namespace a client component reads but CLIENT_NAMESPACES omits would
 *     render raw keys ("checkout.payment") — fail loudly here instead;
 *   • a namespace listed but no longer read by client code is dead weight in
 *     every page's payload.
 * "Read by client code" = a quoted/template string starting with `<ns>.` in any
 * file reachable from a "use client" file through imports.
 */

const root = join(__dirname, "..", "..");
const SRC_DIRS = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const files = SRC_DIRS.flatMap((d) => walk(join(root, d)));
const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

const USE_CLIENT =
  /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use client["']/;

function resolveImport(from: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  if (!base) return null; // a package
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (text.has(cand)) return cand;
  }
  return null;
}

// `import type` / `export type` are erased at build time, so they put nothing in
// the client bundle and are not edges of the graph.
const IMPORT_RE =
  /(?:import|export)\s+(type\s+)?(?:[\w*${}\s,]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function clientGraph(): Set<string> {
  const seen = new Set<string>();
  const stack = files.filter((f) => USE_CLIENT.test(text.get(f)!));
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of text.get(f)!.matchAll(IMPORT_RE)) {
      if (m[1]) continue;
      const target = resolveImport(f, m[2] ?? m[3]);
      if (target && !seen.has(target)) stack.push(target);
    }
  }
  return seen;
}

const reachable = clientGraph();
const namespaces = Object.keys(messages.en);

test("client-reachable code never imports a dictionary or the server locale reader", () => {
  const offenders = [...reachable].filter((f) => {
    const t = text.get(f)!;
    return (
      /from\s+["']@\/lib\/i18n\/(messages|server)["']/.test(t) ||
      /from\s+["'](\.\.?\/)+(lib\/)?i18n\/(messages|server)["']/.test(t)
    );
  });
  assert.deepEqual(
    offenders.map((f) => relative(root, f)),
    [],
    "importing messages.ts/server.ts from client code ships whole dictionaries to the browser",
  );
});

test("CLIENT_NAMESPACES is exactly what client code reads", () => {
  const used = new Set<string>();
  for (const f of reachable) {
    const t = text.get(f)!;
    for (const ns of namespaces) {
      if (new RegExp(`["'\`]${ns}\\.`).test(t)) used.add(ns);
    }
  }
  const expected = [...used].sort();
  const actual = [...CLIENT_NAMESPACES].sort();
  assert.deepEqual(
    actual,
    expected,
    `lib/i18n/client-namespaces.ts must list exactly:\n${JSON.stringify(expected, null, 2)}`,
  );
});

test("every listed namespace exists in both languages", () => {
  for (const ns of CLIENT_NAMESPACES) {
    assert.ok(messages.en[ns], `en.${ns} missing`);
    assert.ok(messages.es[ns], `es.${ns} missing`);
  }
});

test("clientMessages: one language, client namespaces only, Spanish over English", () => {
  const en = clientMessages("en") as Record<string, Record<string, unknown>>;
  const es = clientMessages("es") as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(en).sort(), [...CLIENT_NAMESPACES].sort());
  assert.deepEqual(Object.keys(es).sort(), [...CLIENT_NAMESPACES].sort());
  // Server-only namespaces never leave the server.
  for (const ns of namespaces.filter((n) => !CLIENT_NAMESPACES.includes(n as never))) {
    assert.equal(en[ns], undefined, `${ns} must not reach the browser`);
  }
  assert.equal((en.checkout as Record<string, string>).payment, "Payment");
  assert.equal((es.checkout as Record<string, string>).payment, "Pago");
  // The browser must not carry both languages: the ES payload is the English
  // shape with Spanish text, not en + es side by side.
  const size = (o: unknown) => JSON.stringify(o).length;
  assert.ok(size(es) < size(en) * 1.5, "the Spanish payload must be one language's worth");
});

test("the provider no longer imports a dictionary", () => {
  const provider = readFileSync(join(root, "components/i18n/locale-provider.tsx"), "utf8");
  assert.doesNotMatch(provider, /i18n\/messages/);
  assert.match(provider, /messages: Dict/);
  assert.ok(existsSync(join(root, "lib/i18n/lookup.ts")));
});
