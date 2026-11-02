import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * getCurrencyContext(): QA cookie (?cur=) > x-vercel-ip-country > USD, a USD
 * visitor never touches the rates source, and nothing can throw.
 */

const nextHeadersUrl = pathToFileURL(
  resolve(import.meta.dirname, "../../node_modules/next/headers.js"),
).href;

let cookieJar: Record<string, string> = {};
let headerBag: Record<string, string> = {};

mock.module(nextHeadersUrl, {
  exports: {
    cookies: async () => ({
      get: (k: string) => (k in cookieJar ? { name: k, value: cookieJar[k] } : undefined),
    }),
    headers: async () => ({ get: (k: string) => headerBag[k.toLowerCase()] ?? null }),
  },
});

let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  fetchCalls++;
  return new Response(JSON.stringify({ result: "success", rates: { MXN: 20, COP: 4100, EUR: 0.9 } }));
}) as typeof fetch;

const { getCurrencyContext } = await import("../../lib/currency/server");

// `cache()` dedupes per request in Next; outside a request each call recomputes.
function setup(opts: { cookies?: Record<string, string>; country?: string }) {
  cookieJar = opts.cookies ?? {};
  headerBag = {};
  fetchCalls = 0;
  if (opts.country) headerBag["x-vercel-ip-country"] = opts.country;
}

test("country decides: MX → MXN with the live rate", async () => {
  setup({ country: "MX" });
  assert.deepEqual(await getCurrencyContext(), { code: "MXN", rate: 20, isConverted: true });
});

test("USD countries and unknown/no country → USD and NO rates fetch", async () => {
  for (const country of ["US", "EC", "PA", "ZZ", undefined]) {
    setup({ country });
    assert.deepEqual(await getCurrencyContext(), { code: "USD", rate: 1, isConverted: false }, String(country));
    assert.equal(fetchCalls, 0, String(country));
  }
});

test("QA cookie beats the country, in both directions", async () => {
  setup({ country: "US", cookies: { EV_CUR_QA: "COP" } });
  assert.equal((await getCurrencyContext()).code, "COP");
  setup({ country: "MX", cookies: { EV_CUR_QA: "USD" } });
  assert.equal((await getCurrencyContext()).code, "USD");
});

test("junk or rate-less QA currency falls back to USD instead of breaking", async () => {
  setup({ cookies: { EV_CUR_QA: "12$" }, country: "US" });
  assert.equal((await getCurrencyContext()).code, "USD");
  setup({ cookies: { EV_CUR_QA: "ZZZ" } });
  assert.deepEqual(await getCurrencyContext(), { code: "USD", rate: 1, isConverted: false });
});

test("rates source down → snapshot rate, still converted, never throws", async () => {
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  setup({ country: "MX" });
  const ctx = await getCurrencyContext();
  assert.equal(ctx.code, "MXN");
  assert.ok(ctx.rate > 1);
  globalThis.fetch = realFetch;
});

// ── wiring: middleware only writes a cookie; the layout provides the context ──

const root = join(import.meta.dirname, "..", "..");
const code = (p: string) => readFileSync(join(root, p), "utf8");

test("middleware handles ?cur= with a session cookie and no network", () => {
  const mw = code("middleware.ts");
  assert.match(mw, /searchParams\.get\("cur"\)/);
  assert.match(mw, /QA_CURRENCY_COOKIE/);
  assert.doesNotMatch(mw, /fetch\(|getUsdRates|currency\/rates/);
  // session cookie: no maxAge on the currency override
  assert.doesNotMatch(mw.split("curQa) response.cookies.set")[1]?.split("\n")[0] ?? "", /maxAge/);
});

test("root layout wraps the app in CurrencyProvider", () => {
  const layout = code("app/layout.tsx");
  assert.match(layout, /getCurrencyContext\(\)/);
  assert.match(layout, /<CurrencyProvider value=\{currency\}>/);
});
