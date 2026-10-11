import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureScreenshot } from "../../lib/screenshot-core";
import { buildAnalysisTimings, CAPTURE_PROVIDERS } from "../../lib/analyzer/timings";

/**
 * analyses.timings.captureProvider — which link of the capture chain produced the shot.
 * Until now the timings said HOW LONG a capture took but not WHO did it, so the effect of
 * an exhausted ScreenshotOne quota (every audit silently on the slower free chain) was
 * invisible. Pinned here: each provider labels itself, the chain degrades in order, and
 * the timings builder only ever stores a known provider name.
 */

const IMG = Buffer.alloc(60_000, 7); // > MIN_REAL_SHOT_BYTES (30 KB)
const realFetch = globalThis.fetch;
const envBackup = { ...process.env };
let calls: string[] = [];

function stubFetch(handlers: Record<string, () => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [needle, make] of Object.entries(handlers)) if (url.includes(needle)) return make();
    return new Response("nope", { status: 500 });
  }) as typeof fetch;
}
const ok = () => new Response(IMG, { status: 200, headers: { "content-type": "image/png" } });
const fail = () => new Response(JSON.stringify({ error_code: "x" }), { status: 500 });

beforeEach(() => {
  calls = [];
  delete process.env.SCREENSHOTONE_ACCESS_KEY;
  delete process.env.SCREENSHOT_DISABLE_THUMIO;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...envBackup };
});

test("ScreenshotOne labels itself when it answers", async () => {
  process.env.SCREENSHOTONE_ACCESS_KEY = "k";
  stubFetch({ "api.screenshotone.com": ok });
  const shot = await captureScreenshot("https://acme.com", { budgetMs: 20_000 });
  assert.equal(shot.provider, "screenshotone");
  assert.ok(["image/png", "image/jpeg"].includes(shot.mediaType));
  assert.ok(shot.base64.length > 1000);
});

test("without ScreenshotOne the free thum.io link answers and says so", async () => {
  stubFetch({ "image.thum.io": ok });
  const shot = await captureScreenshot("https://acme.com", { budgetMs: 20_000 });
  assert.equal(shot.provider, "thumio");
  assert.ok(calls.some((u) => u.includes("image.thum.io")));
  assert.ok(!calls.some((u) => u.includes("api.screenshotone.com")), "no key ⇒ ScreenshotOne is never called");
});

test("a failing ScreenshotOne degrades to thum.io, and the label reflects the DEGRADED provider", async () => {
  process.env.SCREENSHOTONE_ACCESS_KEY = "k";
  stubFetch({ "api.screenshotone.com": fail, "image.thum.io": ok });
  const shot = await captureScreenshot("https://www.acme.com", { budgetMs: 20_000 });
  assert.equal(shot.provider, "thumio");
});

test("thum.io disabled ⇒ the chain continues to Microlink and labels it", async () => {
  process.env.SCREENSHOT_DISABLE_THUMIO = "1";
  stubFetch({
    "api.microlink.io": () =>
      new Response(JSON.stringify({ status: "success", data: { screenshot: { url: "https://cdn.test/shot.png" } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    "cdn.test/shot.png": ok,
  });
  const shot = await captureScreenshot("https://acme.com", { budgetMs: 20_000 });
  assert.equal(shot.provider, "microlink");
});

// ── timings ─────────────────────────────────────────────────────────────────

const base = { vision: null, saveMs: 5, runStartedAtMs: 1_000, now: 2_000 };

test("timings record a known provider and nothing else", () => {
  for (const p of CAPTURE_PROVIDERS) {
    assert.equal(buildAnalysisTimings({ ...base, capture: { ms: 4000, cached: false, provider: p } }).captureProvider, p);
  }
  // cache hit / user upload / run recorded before this field existed ⇒ null (never invented)
  assert.equal(buildAnalysisTimings({ ...base, capture: { ms: 300, cached: true, provider: null } }).captureProvider, null);
  assert.equal(buildAnalysisTimings({ ...base, capture: { ms: 300, cached: true } }).captureProvider, null);
  assert.equal(buildAnalysisTimings({ ...base, capture: null }).captureProvider, null);
  // garbage never lands in the jsonb
  for (const bad of ["Screenshotone", "playwright", 5, {}, undefined]) {
    assert.equal(buildAnalysisTimings({ ...base, capture: { ms: 1, cached: false, provider: bad } }).captureProvider, null, String(bad));
  }
  // the pre-existing fields are untouched
  const t = buildAnalysisTimings({ ...base, capture: { ms: 4321.6, cached: false, provider: "mshots" } });
  assert.equal(t.captureMs, 4322);
  assert.equal(t.captureCached, false);
  assert.equal(t.v, 1);
});

test("every provider return in the chain goes through withProvider, and the capture step carries it", () => {
  const core = readFileSync(resolve(import.meta.dirname, "../../lib/screenshot-core.ts"), "utf8");
  const chain = core.slice(core.indexOf("export async function captureScreenshot"), core.indexOf("// ─── Provider implementations"));
  assert.equal((chain.match(/return withProvider\(/g) ?? []).length, 5);
  assert.doesNotMatch(chain, /return await capture/, "a bare provider return would ship an unlabeled shot");
  for (const p of CAPTURE_PROVIDERS) assert.ok(chain.includes(`"${p}"`), p);
  const step = readFileSync(resolve(import.meta.dirname, "../../inngest/functions/analyze-website.ts"), "utf8");
  assert.match(step, /uploadAndUrl\(shot\.base64, shot\.mediaType, shot\.provider\)/);
  assert.match(step, /cached: true,\s*provider: null,/);
  const report = readFileSync(resolve(import.meta.dirname, "../analyzer-latency-report.mjs"), "utf8");
  assert.match(report, /Por proveedor de captura/);
});
