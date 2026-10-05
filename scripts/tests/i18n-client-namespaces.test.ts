import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { messages, clientMessages } from "../../lib/i18n/messages";
import {
  APP_NAMESPACES,
  CLIENT_NAMESPACES,
  CORE_NAMESPACES,
} from "../../lib/i18n/client-namespaces";

/**
 * The browser gets ONE language and ONLY the namespaces client code reads
 * (clientMessages), split in two scopes so public pages stay light:
 *   • CORE — sent with the root layout on every page;
 *   • APP  — mounted (components/i18n/app-scope.tsx) only by the signed-in app
 *            and the public report routes.
 * This guard derives the split from the code:
 *   • a namespace a client component reads but is not provided where it renders
 *     would show raw keys ("checkout.payment") — fail loudly here instead;
 *   • a namespace listed but not read is dead weight in every payload;
 *   • a namespace read by any public page MUST be in CORE (that is how CORE is
 *     computed), so app-only copy can never leak into — or be missing from — a
 *     landing/pricing/blog visit.
 * "Read" = a quoted/template string starting with `<ns>.` in a file reachable
 * from a "use client" file through imports.
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

const USE_SERVER =
  /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use server["']/;
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

/** Files reachable from `starts` through value imports. A "use server" module is
 *  an RPC boundary: the browser only gets a stub, so what it imports never
 *  reaches the client bundle. */
function reach(starts: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    if (USE_SERVER.test(text.get(f)!)) continue;
    seen.add(f);
    for (const m of text.get(f)!.matchAll(IMPORT_RE)) {
      if (m[1]) continue;
      const target = resolveImport(f, m[2] ?? m[3]);
      if (target && !seen.has(target)) stack.push(target);
    }
  }
  return seen;
}

const clientRoots = files.filter((f) => USE_CLIENT.test(text.get(f)!));
const reachable = reach(clientRoots);
const namespaces = Object.keys(messages.en);

const nsRegex = new Map(namespaces.map((ns) => [ns, new RegExp(`["'\`]${ns}\\.`)]));
const ownCache = new Map<string, Set<string>>();
function ownNs(f: string): Set<string> {
  let s = ownCache.get(f);
  if (!s) {
    s = new Set();
    const t = text.get(f)!;
    for (const [ns, re] of nsRegex) if (re.test(t)) s.add(ns);
    ownCache.set(f, s);
  }
  return s;
}

const clientReachCache = new Map<string, Set<string>>();
function clientReach(c: string): Set<string> {
  let s = clientReachCache.get(c);
  if (!s) clientReachCache.set(c, (s = reach([c])));
  return s;
}

/** Namespaces the client code under `entry` (a page/layout) reads. */
function entryNamespaces(entry: string): Set<string> {
  const out = new Set<string>();
  for (const f of reach([entry])) {
    if (!USE_CLIENT.test(text.get(f)!)) continue;
    for (const g of clientReach(f)) for (const ns of ownNs(g)) out.add(ns);
  }
  return out;
}

const ENTRY_RE = /^app\/(.*\/)?(page|layout|not-found|error|global-error|loading|template)\.tsx$/;
const posix = (f: string) => relative(root, f).split(sep).join("/");
const entries = files.filter((f) => ENTRY_RE.test(posix(f)));
const isAppRoute = (rel: string) =>
  /^app\/(\(app\)|audit|s|preview)\//.test(rel);

function chainFor(entry: string): string[] {
  // the entry itself + every layout above it (root layout included)
  const rel = posix(entry);
  const parts = dirname(rel).split("/");
  const chain = [entry];
  for (let i = parts.length; i >= 1; i--) {
    const layout = join(root, ...parts.slice(0, i), "layout.tsx");
    if (text.has(layout) && layout !== entry) chain.push(layout);
  }
  return chain;
}

function computeScopes() {
  const core = new Set<string>();
  const all = new Set<string>();
  for (const e of entries) {
    const ns = new Set<string>();
    for (const c of chainFor(e)) for (const n of entryNamespaces(c)) ns.add(n);
    for (const n of ns) all.add(n);
    if (!isAppRoute(posix(e))) for (const n of ns) core.add(n);
  }
  return { core, all };
}

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

test("CLIENT_NAMESPACES is exactly what client code on a route reads", () => {
  // Client components no page/layout reaches (dead code) are not rendered, so
  // their copy needs no browser payload.
  const expected = [...computeScopes().all].sort();
  const actual = [...CLIENT_NAMESPACES].sort();
  assert.deepEqual(
    actual,
    expected,
    `CORE ∪ APP in lib/i18n/client-namespaces.ts must be exactly:\n${JSON.stringify(expected, null, 2)}`,
  );
});

test("CORE = what public pages read; APP = the rest (derived per route from the import graph)", () => {
  const { core, all } = computeScopes();
  const expectedCore = [...core].sort();
  const expectedApp = [...all].filter((n) => !core.has(n)).sort();
  assert.deepEqual(
    [...CORE_NAMESPACES].sort(),
    expectedCore,
    `CORE_NAMESPACES must be exactly:\n${JSON.stringify(expectedCore, null, 2)}`,
  );
  assert.deepEqual(
    [...APP_NAMESPACES].sort(),
    expectedApp,
    `APP_NAMESPACES must be exactly:\n${JSON.stringify(expectedApp, null, 2)}`,
  );
  assert.deepEqual(
    CORE_NAMESPACES.filter((n) => (APP_NAMESPACES as readonly string[]).includes(n)),
    [],
    "a namespace can only live in one scope",
  );
});

test("the app routes mount the app scope", () => {
  const mounts = [
    "app/(app)/layout.tsx",
    "app/audit/[id]/page.tsx",
    "app/s/[slug]/page.tsx",
    "app/preview/anon-audit/page.tsx",
  ];
  for (const f of mounts) {
    assert.match(readFileSync(join(root, f), "utf8"), /<AppScope>/, `${f} must render <AppScope>`);
  }
  // …and every app-scope route in the tree is one of them (a new route under
  // these prefixes needs the scope too).
  const appPages = entries
    .map(posix)
    .filter((p) => isAppRoute(p) && /\/page\.tsx$/.test(p) && !p.startsWith("app/(app)/"));
  assert.deepEqual(
    appPages.sort(),
    mounts.filter((m) => m.endsWith("page.tsx")).sort(),
  );
});

test("every listed namespace exists in both languages", () => {
  for (const ns of CLIENT_NAMESPACES) {
    assert.ok(messages.en[ns], `en.${ns} missing`);
    assert.ok(messages.es[ns], `es.${ns} missing`);
  }
});

test("clientMessages: one language per scope, Spanish over English", () => {
  for (const [scope, list] of [
    ["core", CORE_NAMESPACES],
    ["app", APP_NAMESPACES],
  ] as const) {
    const en = clientMessages("en", scope) as Record<string, Record<string, unknown>>;
    const es = clientMessages("es", scope) as Record<string, Record<string, unknown>>;
    assert.deepEqual(Object.keys(en).sort(), [...list].sort());
    assert.deepEqual(Object.keys(es).sort(), [...list].sort());
    // The browser must not carry both languages: the ES payload is the English
    // shape with Spanish text, not en + es side by side.
    const size = (o: unknown) => JSON.stringify(o).length;
    assert.ok(size(es) < size(en) * 1.5, `the ${scope} Spanish payload must be one language's worth`);
  }
  const core = clientMessages("en") as Record<string, unknown>;
  // Server-only namespaces never leave the server.
  for (const ns of namespaces.filter((n) => !CLIENT_NAMESPACES.includes(n as never))) {
    assert.equal(core[ns], undefined, `${ns} must not reach the browser`);
  }
  const coreEn = clientMessages("en", "core") as Record<string, Record<string, string>>;
  const coreEs = clientMessages("es", "core") as Record<string, Record<string, string>>;
  const appEn = clientMessages("en", "app") as Record<string, Record<string, string>>;
  const appEs = clientMessages("es", "app") as Record<string, Record<string, string>>;
  const pick = (d: Record<string, Record<string, string>>, ns: string, k: string) => d[ns]?.[k];
  const checkoutScope = (CORE_NAMESPACES as readonly string[]).includes("checkout") ? [coreEn, coreEs] : [appEn, appEs];
  assert.equal(pick(checkoutScope[0], "checkout", "payment"), "Payment");
  assert.equal(pick(checkoutScope[1], "checkout", "payment"), "Pago");
});

test("the provider no longer imports a dictionary", () => {
  const provider = readFileSync(join(root, "components/i18n/locale-provider.tsx"), "utf8");
  assert.doesNotMatch(provider, /i18n\/messages/);
  assert.match(provider, /messages: Dict/);
  assert.ok(existsSync(join(root, "lib/i18n/lookup.ts")));
});

test("every i18n key referenced in code exists in the dictionary (no typos → no raw keys on screen)", () => {
  const missing: string[] = [];
  for (const [f, src] of text) {
    if (/\.test\./.test(f)) continue;
    for (const ns of namespaces) {
      const re = new RegExp(`["'\`](${ns}\\.[A-Za-z0-9_.]*[A-Za-z0-9_])["'\`]`, "g");
      for (const m of src.matchAll(re)) {
        const key = m[1];
        // not i18n keys: a Stripe webhook event name and a file name
        if (key === "checkout.session.completed" || key === "sidebar.tsx") continue;
        let cur: unknown = messages.en;
        for (const part of key.split(".")) {
          cur = typeof cur === "object" && cur !== null ? (cur as Record<string, unknown>)[part] : undefined;
        }
        if (typeof cur !== "string") missing.push(`${relative(root, f)}: ${key}`);
      }
    }
  }
  assert.deepEqual(missing, [], `keys used in code but not defined:\n${missing.join("\n")}`);
});
