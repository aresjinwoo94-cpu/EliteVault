import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_CAPTURE_ATTEMPTS, attemptsAfterFailure, classifyCaptureFailure } from "../../lib/library/capture-outcome";
import { MAX_IMAGE_ATTEMPTS } from "../../lib/library/images";

/** WP-L4: weekly off-Vercel hero capture. Blocked stores are exhausted at once, nothing is unpublished, no Analyzer provider. */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

test("the capture attempt cap is the same as the image job's", () => {
  assert.equal(MAX_CAPTURE_ATTEMPTS, MAX_IMAGE_ATTEMPTS);
});

test("403 / anti-bot / captcha walls are 'blocked'; timeouts, overlays and store outages are 'transient'", () => {
  for (const m of ["HTTP 403", "HTTP 401", "HTTP 429", 'bot wall ("Just a moment")', "Access Denied"]) assert.equal(classifyCaptureFailure(m), "blocked", m);
  for (const m of ["HTTP 503", "HTTP 500", "Navigation timeout of 30000 ms exceeded", "overlay still covering the hero (div#x 40%)", "net::ERR_NAME_NOT_RESOLVED"])
    assert.equal(classifyCaptureFailure(m), "transient", m);
});

test("a blocked store is exhausted at once; any other failure counts one attempt and never exceeds the cap", () => {
  assert.equal(attemptsAfterFailure(0, "blocked"), MAX_CAPTURE_ATTEMPTS);
  assert.equal(attemptsAfterFailure(null, "transient"), 1);
  assert.equal(attemptsAfterFailure(1, "transient"), 2);
  assert.equal(attemptsAfterFailure(MAX_CAPTURE_ATTEMPTS, "transient"), MAX_CAPTURE_ATTEMPTS);
});

test("the capture script selects only un-exhausted no_image rows, holds every capture, and records failures via the classifier", () => {
  const src = read("scripts/library/capture-heroes.mts");
  assert.match(src, /\.eq\("review_reason", "no_image"\)/);
  assert.match(src, /\.is\("thumbnail_url", null\)/);
  assert.match(src, /\.lt\("thumbnail_attempts", MAX_CAPTURE_ATTEMPTS\)/);
  assert.match(src, /\{ hold: true \}/);
  assert.match(src, /classifyCaptureFailure\(err\.message\)/);
  assert.match(src, /setAttempts: attemptsAfterFailure\(/);
  assert.match(src, /--no-sandbox/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /\.update\(\{[^}]*status/, "never touches status");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /screenshotone|thum\.io|microlink|mshots|captureScreenshot/i, "no Analyzer provider");
});

test("saveHeroImage: setAttempts overrides the counter on failure and the success path resets it", () => {
  const src = read("lib/library/images.ts");
  assert.match(src, /opts\.setAttempts !== undefined/);
  assert.match(src, /thumbnail_attempts: 0/);
});

test("the weekly workflow: cron + manual dispatch, concurrency 1, read-only token, secrets only, no Vercel", () => {
  const y = read(".github/workflows/library-hero-capture.yml");
  assert.match(y, /schedule:\s*\n\s*- cron:/);
  assert.match(y, /workflow_dispatch:/);
  assert.match(y, /concurrency:\s*\n\s*group: library-hero-capture\s*\n\s*cancel-in-progress: false/);
  assert.match(y, /permissions:\s*\n\s*contents: read/);
  assert.match(y, /secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(y, /secrets\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(y, /capture-heroes\.mts[^\n]*\$ARGS/);
  assert.match(y, /--ci/);
  assert.doesNotMatch(y.replace(/^\s*#.*$/gm, ""), /vercel|SCREENSHOTONE|GEMINI/i);
  // no secret value is ever echoed
  assert.doesNotMatch(y, /echo[^\n]*secrets\./);
});

test("puppeteer-core is a declared dependency (CI runs npm ci), and the infra doc records the decision", () => {
  const pkg = JSON.parse(read("package.json")) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
  assert.ok({ ...pkg.dependencies, ...pkg.devDependencies }["puppeteer-core"]);
  assert.match(read("docs/infra-debt.md"), /WP-L4[^\n]*implementado|library-hero-capture\.yml/);
});
