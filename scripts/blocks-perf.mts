/**
 * Liquid Blocks — measure the preview pipeline against real storefronts.
 *
 * This exists so the latency numbers in the WP-F.5 commit message can be
 * REPRODUCED rather than believed, and so the two code paths that commit could
 * not exercise — the shared browser under concurrency, and its health check —
 * can be driven on demand.
 *
 * Usage (note the tsconfig: it stubs `server-only` so lib/blocks modules import
 * outside Next, and maps the `@/` alias):
 *
 *   npm run blocks:perf -- <product-url> [more urls…]
 *   npm run blocks:perf -- --concurrent=2 <url> <url>
 *   npm run blocks:perf -- --health-check
 *
 * Needs a real Chrome. Set BLOCKS_CHROME_PATH, the same variable the pipeline
 * uses locally — the @sparticuz build is Linux-only and won't run on a laptop.
 *
 * Default mode runs each store TWICE, once with the request filter and once
 * without, and diffs the measured tokens between them. That diff is the
 * acceptance condition for the filter: it may make the preview faster, and it
 * may not change a single thing we measure.
 *
 * Touches no database and uploads nothing. It is a measuring instrument.
 */
import type { Browser } from "puppeteer-core";
import {
  acquireBlocksBrowser,
  releaseSharedBrowser,
  BLOCKS_USER_AGENT,
  BLOCKS_VIEWPORT,
} from "@/lib/blocks/browser";
import {
  collectDesignTokens,
  dismissOverlays,
  injectBlock,
  productPageIsReady,
  productPageSettled,
  removeBlock,
  frameBlock,
  scrollToPosition,
  ANCHOR_SELECTORS,
  BUY_BUTTON_ATTR,
  BUY_BUTTON_SELECTORS,
  BUY_BUTTON_TEXT,
  CONTAINER_SELECTORS,
  CROSS_SELL_CONTAINERS,
  OVERLAY_SELECTORS,
  SURFACE_SELECTORS,
} from "@/lib/blocks/collect-tokens";
import { normalizeDesignTokens, type DesignTokens } from "@/lib/blocks/design-tokens";
import { renderBlock } from "@/lib/blocks/render-block";
import { parseShopifyProductJson } from "@/lib/blocks/product-json";
import { parseShopifyProductUrl } from "@/lib/blocks/product-url";
import { shouldBlockRequest } from "@/lib/blocks/request-filter";

const STYLE_ID = "ev-blocks-preview-style";

interface RunResult {
  store: string;
  filtered: boolean;
  totalMs: number;
  phases: Record<string, number>;
  blocked: number;
  seen: number;
  tokens: DesignTokens;
  blockVisiblePx: number;
  blockHeightPx: number;
}

/** The token fields the preview's fidelity claim actually rests on. */
function fingerprint(t: DesignTokens): Record<string, string | number> {
  return {
    accent: t.palette.accent,
    accentText: t.palette.accentText,
    pageBackground: t.palette.pageBackground,
    surface: t.palette.surface,
    textPrimary: t.palette.textPrimary,
    border: t.palette.border,
    headingFamily: t.type.headingFamily,
    bodyFamily: t.type.bodyFamily,
    baseSizePx: t.type.baseSizePx,
    headingWeight: t.type.headingWeight,
    radiusPx: t.shape.radiusPx,
    containerMaxWidthPx: t.shape.containerMaxWidthPx,
    fallbacks: t.fallbacks.slice().sort().join(","),
  };
}

async function runOnce(
  browser: Browser,
  storeUrl: string,
  filtered: boolean,
): Promise<RunResult | null> {
  const phases: Record<string, number> = {};
  const since = (t: number) => Date.now() - t;
  const started = Date.now();

  const ref = parseShopifyProductUrl(storeUrl);
  if (!ref) {
    console.log(`  ${storeUrl}: not a Shopify product URL shape`);
    return null;
  }
  const res = await fetch(ref.productJsUrl, {
    headers: { "User-Agent": BLOCKS_USER_AGENT },
  });
  const product = parseShopifyProductJson(await res.json().catch(() => null));
  if (!product) {
    console.log(`  ${storeUrl}: product endpoint unreadable (HTTP ${res.status})`);
    return null;
  }

  const page = await browser.newPage();
  let blocked = 0;
  let seen = 0;
  try {
    await page.setUserAgent(BLOCKS_USER_AGENT);
    await page.setViewport(BLOCKS_VIEWPORT);
    await page.evaluateOnNewDocument(() => {
      const w = window as unknown as { __name?: (f: unknown) => unknown };
      if (typeof w.__name !== "function") w.__name = (f: unknown) => f;
    });

    const pageOrigin = new URL(storeUrl).origin;
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      seen++;
      if (!filtered) {
        void req.continue().catch(() => {});
        return;
      }
      const verdict = shouldBlockRequest({
        url: req.url(),
        resourceType: req.resourceType(),
        pageOrigin,
      });
      if (verdict.block) {
        blocked++;
        void req.abort().catch(() => {});
      } else {
        void req.continue().catch(() => {});
      }
    });

    const navStart = Date.now();
    await page.goto(storeUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
    phases.nav = since(navStart);

    // Mirrors the pipeline's two-phase wait exactly. If these diverge, the
    // numbers this prints stop describing the thing being measured.
    const readyStart = Date.now();
    const sawButton = await page
      .waitForFunction(
        productPageIsReady,
        { timeout: 4_000, polling: 250 },
        {
          buttonSelectors: BUY_BUTTON_SELECTORS,
          buttonTextPattern: BUY_BUTTON_TEXT.source,
          crossSellContainers: CROSS_SELL_CONTAINERS,
        },
      )
      .then(() => true)
      .catch(() => false);
    if (!sawButton) {
      await page
        .waitForFunction(productPageSettled, { timeout: 2_500, polling: 250 })
        .catch(() => undefined);
    }
    phases.ready = since(readyStart);

    const tokensStart = Date.now();
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.evaluate(dismissOverlays, OVERLAY_SELECTORS);
    const raw = await page.evaluate(collectDesignTokens, {
      buttonSelectors: BUY_BUTTON_SELECTORS,
      buttonTextPattern: BUY_BUTTON_TEXT.source,
      crossSellContainers: CROSS_SELL_CONTAINERS,
      surfaceSelectors: SURFACE_SELECTORS,
      containerSelectors: CONTAINER_SELECTORS,
      anchorSelectors: ANCHOR_SELECTORS,
      buyButtonAttr: BUY_BUTTON_ATTR,
    });
    const tokens = normalizeDesignTokens(raw);
    phases.tokens = since(tokensStart);

    const injectStart = Date.now();
    const rendered = renderBlock({
      spec: { type: "product_facts" },
      tokens,
      product,
      currency: product.currency ?? null,
    });
    const injected = await page.evaluate(injectBlock, {
      html: rendered.html,
      css: rendered.css,
      anchorSelectors: ANCHOR_SELECTORS,
      buyButtonAttr: BUY_BUTTON_ATTR,
      styleId: STYLE_ID,
    });
    await page.evaluate(scrollToPosition, { top: injected.blockTop, offsetPx: 220 });
    await new Promise((r) => setTimeout(r, 700));
    const framed = await page.evaluate(frameBlock);
    await new Promise((r) => setTimeout(r, 150));
    phases.inject = since(injectStart);

    const captureStart = Date.now();
    await page.screenshot({ type: "jpeg", quality: 82 });
    await page.evaluate(removeBlock, STYLE_ID);
    await page.evaluate((y: number) => window.scrollTo(0, y), framed.scrollY);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ type: "jpeg", quality: 82 });
    phases.capture = since(captureStart);

    return {
      store: new URL(storeUrl).hostname,
      filtered,
      totalMs: since(started),
      phases,
      blocked,
      seen,
      tokens,
      blockVisiblePx: framed.visiblePx,
      blockHeightPx: framed.height,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function printRun(r: RunResult): void {
  const p = r.phases;
  console.log(
    `  ${r.filtered ? "filtered  " : "unfiltered"} | ${String(r.totalMs).padStart(6)}ms — ` +
      `nav ${p.nav} · ready ${p.ready} · tokens ${p.tokens} · inject ${p.inject} · capture ${p.capture}` +
      (r.filtered ? ` | blocked ${r.blocked}/${r.seen}` : ` | ${r.seen} requests`),
  );
  console.log(
    `             block ${r.blockVisiblePx}/${r.blockHeightPx}px · fallbacks: ${r.tokens.fallbacks.join(",") || "none"}`,
  );
}

/**
 * The acceptance condition for the request filter: it may make the preview
 * faster, and it may not change one thing we measure.
 */
function compareTokens(a: RunResult, b: RunResult): boolean {
  const fa = fingerprint(a.tokens);
  const fb = fingerprint(b.tokens);
  const drift = Object.keys(fa).filter((k) => String(fa[k]) !== String(fb[k]));
  if (drift.length === 0) {
    console.log("             TOKENS IDENTICAL with and without the filter ✓");
    return true;
  }
  console.log("             ✗ TOKEN DRIFT — the filter changed what we measure:");
  for (const k of drift) console.log(`               ${k}: ${fa[k]} → ${fb[k]}`);
  return false;
}

/**
 * Two previews competing for the shared browser.
 *
 * The path WP-F.5 could not exercise: `acquireBlocksBrowser` must hand both
 * runs the SAME instance, start exactly one launch, and only release it once
 * the last lease is returned.
 */
async function concurrencyCheck(urls: string[], n: number): Promise<void> {
  console.log(`\n── shared browser under ${n} concurrent previews ──`);
  const leases = await Promise.all(
    Array.from({ length: n }, () => acquireBlocksBrowser()),
  );
  const ids = new Set(leases.map((l) => l.browser.process()?.pid ?? -1));
  const colds = leases.filter((l) => l.coldStart).length;
  console.log(`  distinct Chromium processes: ${ids.size} (expected 1)`);
  console.log(`  runs reporting a cold start: ${colds} (expected at most 1)`);

  if (urls.length > 0) {
    const started = Date.now();
    const results = await Promise.all(
      leases.map((l, i) => runOnce(l.browser, urls[i % urls.length], true)),
    );
    console.log(`  ${results.filter(Boolean).length}/${n} previews completed in ${Date.now() - started}ms wall-clock`);
  }

  for (const l of leases) await l.release();
  // Still alive after the leases are returned — the idle timer releases it
  // later, and a preview arriving now must not pay for another launch.
  const after = await acquireBlocksBrowser();
  console.log(
    `  after all leases returned, next acquire cold? ${after.coldStart} (expected false)`,
  );
  await after.release();
  console.log(ids.size === 1 && colds <= 1 ? "  PASS" : "  ✗ FAIL");
}

/**
 * Kill the browser between previews and confirm the next acquisition notices.
 *
 * This is what stands between a reaped container and every subsequent preview
 * failing against a dead handle.
 */
async function healthCheck(): Promise<void> {
  console.log("\n── health check: a browser that died between runs ──");
  const first = await acquireBlocksBrowser();
  const pid = first.browser.process()?.pid;
  console.log(`  acquired (pid ${pid ?? "?"}), cold: ${first.coldStart}`);
  await first.release();

  // Kill it the way a container reaper would.
  await first.browser.close().catch(() => {});
  console.log("  browser killed");

  const second = await acquireBlocksBrowser();
  const pid2 = second.browser.process()?.pid;
  const relaunched = pid2 !== undefined && pid2 !== pid;
  console.log(`  re-acquired (pid ${pid2 ?? "?"}), cold: ${second.coldStart}`);
  console.log(
    relaunched
      ? "  PASS — isAlive detected the dead browser and relaunched"
      : "  ✗ FAIL — the same dead handle was handed back",
  );
  // Prove it actually works, not just that it's a different object.
  const page = await second.browser.newPage();
  await page.close();
  console.log("  new browser is usable ✓");
  await second.release();
}

// ── main ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const urls = args.filter((a) => !a.startsWith("--"));
const concurrentArg = args.find((a) => a.startsWith("--concurrent"));
const wantsHealth = args.includes("--health-check");

if (!process.env.BLOCKS_CHROME_PATH && !process.env.PUPPETEER_EXECUTABLE_PATH) {
  console.error(
    "Set BLOCKS_CHROME_PATH to a real Chrome — the serverless Chromium build is Linux-only.\n" +
      'e.g. BLOCKS_CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"',
  );
  process.exit(1);
}

try {
  if (wantsHealth) await healthCheck();

  if (concurrentArg) {
    const n = Number(concurrentArg.split("=")[1] ?? 2);
    await concurrencyCheck(urls, Number.isFinite(n) && n > 0 ? n : 2);
  } else if (urls.length > 0) {
    const lease = await acquireBlocksBrowser();
    console.log(
      `browser acquired (cold: ${lease.coldStart}) — every store below reuses it\n`,
    );
    let allIdentical = true;
    for (const url of urls) {
      console.log(new URL(url).hostname);
      const unfiltered = await runOnce(lease.browser, url, false);
      const filtered = await runOnce(lease.browser, url, true);
      if (unfiltered) printRun(unfiltered);
      if (filtered) printRun(filtered);
      if (unfiltered && filtered) {
        if (!compareTokens(unfiltered, filtered)) allIdentical = false;
        const delta = unfiltered.totalMs - filtered.totalMs;
        const pct = Math.round((delta / unfiltered.totalMs) * 100);
        console.log(
          `             filter saved ${delta}ms (${pct}%) on this run\n`,
        );
      }
    }
    await lease.release();
    console.log(
      allIdentical
        ? "All stores: measured tokens unchanged by the filter."
        : "✗ At least one store measured differently with the filter on.",
    );
  } else if (!wantsHealth) {
    console.error("Give me at least one product URL, or --health-check.");
    process.exit(1);
  }
} finally {
  await releaseSharedBrowser();
}
