import type { Browser, Page } from "puppeteer-core";
import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { enterMeter } from "@/lib/usage/context";
import type { PlanTier } from "@/lib/supabase/types";
import { validatePublicStoreUrl } from "@/lib/security/url-guard";
import {
  acquireBlocksBrowser,
  closeQuietly,
  BLOCKS_USER_AGENT,
  BLOCKS_VIEWPORT,
} from "@/lib/blocks/browser";
import {
  collectDesignTokens,
  dismissOverlays,
  injectBlock,
  productPageIsReady,
  productPageSettled,
  tokenSignature,
  removeBlock,
  reparentBlockToMain,
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
import { applyTokenOverrides, normalizeDesignTokens } from "@/lib/blocks/design-tokens";
import { renderBlock } from "@/lib/blocks/render-block";
import type { BlockSpec } from "@/lib/blocks/render-block";
import type { BlockSpecInput } from "@/lib/blocks/catalog";
import type { BlocksProduct } from "@/lib/blocks/product-json";
import { startDeadline } from "@/lib/deadline";
import { recordBrowserCost } from "@/lib/blocks/browser-cost";
import { shouldBlockRequest } from "@/lib/blocks/request-filter";

/**
 * Liquid Blocks WP-B — measure the store, wear its clothes, prove it in a
 * picture.
 *
 * One browser launch does all three jobs in the same session, which is both
 * cheaper and more truthful than splitting them: the tokens are read from the
 * exact render that is then screenshotted, so the preview can't disagree with
 * the calibration.
 *
 * # Why this is an Inngest function and not a request
 * A cold Chromium start plus a real store's page load plus two captures does
 * not fit in a request the user is waiting on, and a request that dies halfway
 * leaves nothing behind. As a step, a failure is durable, retryable, and
 * visible in the row.
 *
 * # Why a failure here costs the user nothing
 * The preview is free. There is no credit to refund and no charge to reverse —
 * a failed run just marks the project `failed` with an honest reason and the
 * user can re-run it. The money moment is the export (WP-D), deliberately.
 *
 * # The paywall's integrity
 * No Liquid is generated in this pipeline, and none is stored. What the client
 * eventually receives is two image URLs and the design tokens (measurements of
 * the user's OWN store, which are theirs). The block's markup exists only
 * inside this worker's memory, inside a headless browser, for the duration of
 * two screenshots. There is nothing here to leak.
 */

/**
 * Per-step budget. Must expire BEFORE the route's maxDuration or Vercel kills
 * the invocation mid-step and Inngest only sees an opaque 504 — the failure
 * mode lib/deadline.ts exists to prevent. The route is at 300s, so this leaves
 * ~55s of headroom for the uploads and writes that follow inside the step.
 */
const STEP_BUDGET_MS = (() => {
  const raw = Number(process.env.BLOCKS_STEP_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 245_000;
})();

/** How long to wait for a store's page to become usable. */
const NAV_TIMEOUT_MS = (() => {
  const raw = Number(process.env.BLOCKS_NAV_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 25_000;
})();

/**
 * Concurrency. A headless Chromium is the heaviest thing this codebase runs —
 * memory, not rate limits, is the ceiling here — so the global cap is low and
 * a single user can only ever occupy one slot. Inngest queues the rest, which
 * turns a burst into a wait instead of a wave of OOM failures.
 */
const GLOBAL_CONCURRENCY = (() => {
  const raw = Number(process.env.BLOCKS_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 2;
})();

/** Pixels of page kept above the block, so the shot shows what it attaches to. */
const BLOCK_OFFSET_PX = 220;

/**
 * How many times a moving measurement is re-read before we take it anyway.
 * Six reads at 400ms is up to ~2.4s — well under the 8s fixed wait it
 * replaces, and only paid by the stores that need it.
 */
const TOKEN_STABILITY_READS = Number(process.env.BLOCKS_TOKEN_STABILITY_READS ?? 6);
const TOKEN_STABILITY_GAP_MS = Number(process.env.BLOCKS_TOKEN_STABILITY_GAP_MS ?? 400);

const STYLE_ID = "ev-blocks-preview-style";
const BUCKET = "screenshots";

/** Turn an unknown throw into something the user can act on. */
function humanize(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/CHROMIUM_PACK_URL|BLOCKS_CHROME_PATH/.test(msg)) {
    return "Liquid Blocks isn't fully configured on this deployment yet. Nothing you did wrong — the browser it uses to measure your store hasn't been set up.";
  }
  if (/net::ERR_|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/.test(msg)) {
    return "We couldn't open that product page from our servers. Check it loads publicly (no password page) and try again.";
  }
  // A store that bounces our browser elsewhere will do it every time, so
  // "try again in a minute" would be a lie that costs the user a minute.
  if (/Refusing to (render|publish)/.test(msg)) {
    return "That product page sent our browser to a different site, so we stopped. Some stores redirect automated browsers away — if yours does, we can't measure it.";
  }
  if (/no height|collapsed it/.test(msg)) {
    return "We placed the block on your page but the theme's layout collapsed it to nothing, so there was no preview worth showing.";
  }
  if (/timeout|Navigation timeout|budget exhausted/i.test(msg)) {
    return "Your product page took too long to load for us to measure it. Try again — if it keeps happening, the store may be blocking automated browsers.";
  }
  return "We couldn't build the preview for that page. Try again in a minute.";
}

/**
 * Screenshot a rectangle of the CURRENT viewport. Both shots of a pair use the
 * identical clip, which is what makes them a comparison.
 */
async function shoot(
  page: Page,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  const shot = await page.screenshot({
    type: "jpeg",
    quality: 82,
    fullPage: false,
    ...(clip ? { clip, captureBeyondViewport: false } : {}),
  });
  return Buffer.from(shot);
}

export const blocksPreview = inngest.createFunction(
  {
    id: "blocks-preview",
    name: "Liquid Blocks — calibrate and preview",
    // One retry, not two. The expensive failures here (a store that blocks
    // headless browsers, a page that never settles) are deterministic — a
    // second identical attempt buys nothing but another cold Chromium start.
    retries: 1,
    concurrency: [
      { limit: GLOBAL_CONCURRENCY },
      { key: "event.data.userId", limit: 1 },
    ],
    onFailure: async ({ event, error }) => {
      const service = createSupabaseServiceClient();
      const data = (
        event as unknown as {
          data: { event: { data: { projectId: string } } };
        }
      ).data.event.data;
      // No refund branch, unlike the Analyzer's: nothing was charged.
      // `as any`: post-0001 tables resolve to `never` under the stale Database
      // type (see app/actions/blocks.ts). Applies to every write in this file.
      await (service.from("blocks_projects") as any)
        .update({
          status: "failed",
          error: humanize(error),
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.projectId);
    },
  },
  { event: "blocks/preview.requested" },
  async ({ event, step }) => {
    const { projectId, userId, plan } = event.data;
    // WP-E attributes any AI call in this pipeline to the user + 'blocks'.
    // Set here so it survives every step continuation below.
    enterMeter({
      userId,
      plan: (plan as PlanTier | null | undefined) ?? null,
      eventType: "blocks",
      meta: { projectId },
    });
    const service = createSupabaseServiceClient();

    await step.run("mark-capturing", async () => {
      await (service.from("blocks_projects") as any)
        .update({ status: "capturing", error: null, updated_at: new Date().toISOString() })
        .eq("id", projectId);
    });

    // Calibrate + inject + capture in ONE step and ONE browser session. Split
    // across steps, each would pay its own cold Chromium start, and — worse —
    // the tokens would come from a different page render than the screenshots,
    // so the preview could disagree with the calibration it claims to show.
    await step.run("calibrate-and-capture", async () => {
      const dl = startDeadline(STEP_BUDGET_MS);

      const { data: project } = await service
        .from("blocks_projects")
        .select("product_url, product_json, block_spec, token_overrides")
        .eq("id", projectId)
        .single();
      if (!project) throw new Error(`blocks project ${projectId} not found`);

      const row = project as unknown as {
        product_url: string;
        product_json: (BlocksProduct & { currency: string | null }) | null;
        block_spec: BlockSpecInput | null;
        token_overrides: Record<string, string> | null;
      };
      if (!row.product_json) {
        throw new Error("This project has no product data — start it again.");
      }

      // Re-validated even though WP-A already did: this URL has been to the
      // database and back, and it is about to be handed to a real browser that
      // will execute whatever it finds. Same reasoning as lib/blocks/fetch-product.ts.
      const guard = validatePublicStoreUrl(row.product_url);
      if (!guard.ok) throw new Error(`Refusing to open ${row.product_url}: ${guard.reason}`);

      let browser: Browser | null = null;
      // WP-E: the headless session is the expensive part of this feature and the
      // only cost here that isn't tokens. Timed from just before launch so the
      // cold Chromium start — the biggest and least predictable slice — is
      // inside the measurement rather than excluded from it.
      const browserStartedAt = Date.now();
      let browserOk = false;
      /** Phase timings, so "the preview is slow" can be answered with numbers. */
      const phase: Record<string, number> = {};
      const since = (t: number) => Date.now() - t;
      let releaseBrowser: (() => Promise<void>) | null = null;
      let page: Page | null = null;
      try {
        // WP-F.5 — a browser kept warm between previews. Measured cold-launch
        // cost was ~1.1-1.3s on every single run, paid before any of the work
        // the merchant is waiting on begins.
        const lease = await acquireBlocksBrowser();
        browser = lease.browser;
        releaseBrowser = lease.release;
        phase.launch = since(browserStartedAt);
        phase.cold = lease.coldStart ? 1 : 0;

        page = await browser.newPage();
        await page.setUserAgent(BLOCKS_USER_AGENT);
        await page.setViewport(BLOCKS_VIEWPORT);

        /**
         * Drop what cannot change what we measure.
         *
         * Measured honestly: this is a smaller lever than it looks. On two real
         * storefronts it blocked 19 of 336 and 18 of 621 requests, because
         * Shopify serves most assets from its own CDN — which is third-party
         * but is emphatically NOT noise. The win shows up in the capture phase
         * rather than in navigation.
         *
         * The rule is asymmetric on purpose: when in doubt, allow. Stylesheets,
         * fonts and everything same-origin are never blocked, because the
         * product IS the measurement — a faster preview that reports the wrong
         * typeface is worse than no preview. Verified against real stores that
         * every measured token is byte-identical with the filter on and off.
         */
        const pageOrigin = new URL(guard.url).origin;
        let blockedCount = 0;
        await page.setRequestInterception(true);
        page.on("request", (req) => {
          try {
            const verdict = shouldBlockRequest({
              url: req.url(),
              resourceType: req.resourceType(),
              pageOrigin,
            });
            if (verdict.block) {
              blockedCount++;
              void req.abort().catch(() => {});
            } else {
              void req.continue().catch(() => {});
            }
          } catch {
            // A handler that throws would hang the request forever. Letting it
            // through is always the safe direction.
            void req.continue().catch(() => {});
          }
        });

        // The functions below are serialized and run inside the store's page.
        // esbuild's keepNames transform can wrap inner arrow functions in a
        // module-scope `__name()` helper that doesn't exist in a browser, and
        // when it does every page.evaluate here throws `__name is not defined`
        // — at runtime, in production, with nothing in the test suite able to
        // see it. The current production bundle happens to come out clean, but
        // that's a property of the minifier rather than of our code. A two-line
        // identity polyfill makes it not matter either way.
        await page.evaluateOnNewDocument(() => {
          const w = window as unknown as { __name?: (f: unknown) => unknown };
          if (typeof w.__name !== "function") w.__name = (f: unknown) => f;
        });
        // The store's own scripts are what produce the computed styles we're
        // here to read, so JS stays ON. Only the page's own noise is skipped.
        page.setDefaultTimeout(Math.min(NAV_TIMEOUT_MS, dl.remaining()));

        const navStart = Date.now();
        await page.goto(guard.url, {
          // `networkidle0` waits for chat widgets and trackers that never
          // settle on a busy storefront; `domcontentloaded` plus a short settle
          // gets the theme's CSS applied without paying for the tail.
          waitUntil: "domcontentloaded",
          timeout: Math.min(NAV_TIMEOUT_MS, Math.max(5_000, dl.remaining())),
        });
        // Let webfonts and above-the-fold images land — a font that hasn't
        // loaded yet reports the fallback stack, which would make us calibrate
        // against a face the visitor never sees.
        await page
          .evaluate(() => document.fonts?.ready)
          .catch(() => undefined);
        phase.nav = since(navStart);

        // Wait for the page to be worth measuring rather than for a fixed
        // number of seconds. Measured across five real storefronts: on the
        // JS-heavy ones the buy button, price and product form all still had
        // zero size several seconds after DOMContentLoaded, so calibration read
        // an unlaid-out page and found nothing. Best-effort — a store that
        // never satisfies it is still measured, just with whatever is there.
        /**
         * Two questions, in order of usefulness — the single biggest latency
         * win in this pipeline.
         *
         * The strong one first: is the buy button laid out? When it is, we're
         * ready in a few hundred milliseconds and calibration gets the accent
         * colour from the element the shopper actually clicks.
         *
         * The weak one as an escape hatch: has the page laid out AT ALL? Plenty
         * of real stores never expose a buy button to a headless browser — a
         * hidden quick-add template, a headless storefront, a shop that sells
         * through Amazon — and the old code polled the strong question until
         * the timeout expired every single time. Measured on one such store:
         * 12.0s of a 17.9s preview, 67% of the run, spent waiting for something
         * that was never going to arrive.
         *
         * So the strong wait is short, and failing it falls through to a much
         * shorter settle check rather than to the floor. Fast stores are
         * unaffected; hopeless ones stop costing twelve seconds to discover.
         */
        const readyStart = Date.now();
        const sawButton = await page
          .waitForFunction(
            productPageIsReady,
            { timeout: Math.min(4_000, Math.max(1_500, dl.remaining() - 60_000)), polling: 250 },
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
            .catch(() =>
              console.warn("[blocks] page never settled — measuring as-is"),
            );
        }
        phase.ready = since(readyStart);

        // A redirect can leave the origin we validated. WP-A closes exactly this
        // hole for the JSON fetch (lib/blocks/fetch-product.ts) because the URL
        // guard is syntactic and never resolves DNS; the same reasoning applies
        // with more force here, since this page is RENDERED, screenshotted, and
        // the result uploaded to a public bucket.
        const landedOn = page.url();
        if (new URL(landedOn).origin !== new URL(guard.url).origin) {
          throw new Error(
            `Refusing to render ${landedOn}: it redirected away from ${new URL(guard.url).origin}.`,
          );
        }

        // Modals and cookie bars sit between the reader and the proof. The
        // Analyzer deliberately keeps them in frame — an aggressive popup is a
        // CRO finding there — but this screenshot has one job and it isn't
        // auditing the store.
        await page.keyboard.press("Escape").catch(() => undefined);
        const hidden = await page.evaluate(dismissOverlays, OVERLAY_SELECTORS);
        if (hidden > 0) console.log(`[blocks] hid ${hidden} overlay(s)`);

        dl.assert("blocks-calibrate");

        // ── 1. Calibration ────────────────────────────────────────────────
        const tokensStart = Date.now();
        const collectArgs = {
          buttonSelectors: BUY_BUTTON_SELECTORS,
          buttonTextPattern: BUY_BUTTON_TEXT.source,
          crossSellContainers: CROSS_SELL_CONTAINERS,
          surfaceSelectors: SURFACE_SELECTORS,
          containerSelectors: CONTAINER_SELECTORS,
          anchorSelectors: ANCHOR_SELECTORS,
          buyButtonAttr: BUY_BUTTON_ATTR,
        };

        /**
         * Measure until the measurement stops changing.
         *
         * A verifier caught the calibration being NON-DETERMINISTIC on a
         * mainstream store: two identically-configured runs produced opposite
         * palettes, because the read landed mid-render and whichever one the
         * merchant drew was shown to them as "measured". That was the real cost
         * of shortening the readiness wait from 8s to 4s — latency bought with
         * measurement stability, and the commit that did it did not say so
         * because it did not know.
         *
         * Restoring the 8s would fix it and charge every already-stable store
         * eight seconds for the privilege. Two agreeing reads answer the actual
         * question, and cost ~150ms when the page was ready all along.
         */
        // Only collectDesignTokens crosses into the page; the signature is
        // taken from its RESULT, in Node. Passing tokenSignature to evaluate
        // instead threw on every store, because puppeteer serializes the one
        // function it is handed and the name it called did not exist there.
        let reading = await page.evaluate(collectDesignTokens, collectArgs);
        let signature = tokenSignature(reading);
        for (let attempt = 1; attempt <= TOKEN_STABILITY_READS; attempt++) {
          await new Promise((r) => setTimeout(r, TOKEN_STABILITY_GAP_MS));
          reading = await page.evaluate(collectDesignTokens, collectArgs);
          const next = tokenSignature(reading);
          if (next === signature) break;
          signature = next;
          if (attempt === TOKEN_STABILITY_READS) {
            // Still moving. Measured anyway — a late reading beats none — but
            // the log is what turns "the colours look wrong" into a diagnosis.
            console.warn(
              `[blocks] tokens never settled for ${projectId} after ${TOKEN_STABILITY_READS} reads; measuring the last one`,
            );
          }
        }

        /**
         * The reading the loop just proved stable — not a fresh one.
         *
         * Collecting again here would throw away the agreement we paid for and
         * substitute an unverified read, which is the exact bug the loop exists
         * to close: it would still be possible for the values that reach the
         * merchant to be the ones taken mid-render. It also saves a round trip.
         */
        const raw = reading;
        const measured = normalizeDesignTokens(raw);

        // The merchant's corrections win over what we read — that's the point
        // of offering them. Applied here rather than at export so the preview
        // they approve is styled with the values they chose, not the ones we
        // guessed and they then fixed.
        const tokens = row.token_overrides
          ? applyTokenOverrides(measured, row.token_overrides)
          : measured;
        const injectStart = Date.now();

        // Preview whichever block they picked. Before they've picked one, the
        // calibration panel stands in: it needs no input from them and shows
        // the measurement, which is what the first visit is actually asking
        // them to confirm.
        const spec: BlockSpec = row.block_spec ?? { type: "product_facts" };

        const rendered = renderBlock({
          spec,
          tokens,
          product: row.product_json,
          currency: row.product_json.currency ?? null,
        });
        const injectArgs = {
          html: rendered.html,
          css: rendered.css,
          anchorSelectors: ANCHOR_SELECTORS,
          buyButtonAttr: BUY_BUTTON_ATTR,
          styleId: STYLE_ID,
        };

        // ── 2. Inject, then frame on the block itself ─────────────────────
        // AFTER is captured first, and that inversion is the whole fix. Framing
        // on the anchor and hoping the block landed in view failed on three of
        // five real stores — a block goes in after the anchor's ENTIRE height,
        // so a tall wrapper pushed it ~1700px down, out of frame, and the
        // "after" came back pixel-identical to the "before". Capturing from the
        // block's own measured position makes it impossible to miss.
        const injected = await page.evaluate(injectBlock, injectArgs);
        if (!injected.ok) {
          throw new Error(
            "We placed the block on that page but it rendered with no height — the theme's layout collapsed it.",
          );
        }

        await page.evaluate(scrollToPosition, {
          top: injected.blockTop,
          offsetPx: BLOCK_OFFSET_PX,
        });
        // Settle FIRST, then frame. Lazy images above the block finish loading
        // after the scroll and push it down — measured live, a 269px block that
        // the arithmetic put fully in view was 150px cut off by the time the
        // shutter opened. Centring after everything has moved is what holds.
        await new Promise((r) => setTimeout(r, 700));
        let framed = await page.evaluate(frameBlock);

        // Centring can't rescue a block whose PARENT clips it — measured on a
        // store whose buy box is a sticky narrow rail, where the block stayed
        // 44% cut off however it was scrolled. Re-homing it into the main
        // column is the only thing that helps, and a partly-visible proof is
        // worth less than a whole one somewhere slightly less ideal.
        if (framed.height > 0 && framed.visiblePx < framed.height * 0.9) {
          const rescued = await page.evaluate(reparentBlockToMain);
          if (rescued) {
            await new Promise((r) => setTimeout(r, 300));
            framed = await page.evaluate(frameBlock);
          }
        }
        // Only a paint tick here, deliberately: a longer wait would reopen the
        // window this reordering exists to close.
        await new Promise((r) => setTimeout(r, 150));
        console.log(
          `[blocks] block ${framed.visiblePx}/${framed.height}px visible, anchor=${injected.anchor}`,
        );

        phase.inject = since(injectStart);
        const captureStart = Date.now();
        const after = await shoot(page);

        // ── 3. The same frame, without the block ──────────────────────────
        // Nothing ABOVE the insertion point moves when the block is removed, so
        // re-pinning the scroll gives the identical frame minus the block.
        //
        // Deliberately NOT a clipped capture: clipping to the block's rectangle
        // read better on paper, but the second shot kept failing with "cannot
        // take screenshot with 0 height" once the block was gone and the
        // document reflowed. A full viewport at a pinned scroll has no such
        // failure mode, and the block is centred in it either way.
        await page.evaluate(removeBlock, STYLE_ID);
        await page.evaluate((y: number) => window.scrollTo(0, y), framed.scrollY);
        await new Promise((r) => setTimeout(r, 400));
        const before = await shoot(page);
        phase.capture = since(captureStart);

        // (The block was already removed to take the "before" shot, so the page
        // is back to its original state at this point.)

        dl.assert("blocks-upload");

        // Re-assert the origin immediately before anything is written. The
        // check after navigation is a point in time, and several seconds of
        // injection, framing and two captures happen after it — a page that
        // bounces in that window would otherwise be rendered, shot, and
        // published to a PUBLIC bucket.
        const finalUrl = page.url();
        if (new URL(finalUrl).origin !== new URL(guard.url).origin) {
          throw new Error(
            `Refusing to publish a capture of ${finalUrl}: the page left ${new URL(guard.url).origin} while we worked.`,
          );
        }

        // ── 4. Persist ────────────────────────────────────────────────────
        const upload = async (name: string, body: Buffer): Promise<string> => {
          const path = `blocks/${projectId}-${name}.jpg`;
          const { error: upErr } = await service.storage
            .from(BUCKET)
            .upload(path, body, { contentType: "image/jpeg", upsert: true });
          if (upErr) throw new Error(`preview upload failed: ${upErr.message}`);
          return service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        };
        const [beforeUrl, afterUrl] = await Promise.all([
          upload("before", before),
          upload("after", after),
        ]);

        await (service.from("blocks_projects") as any)
          .update({
            // The tokens travel to the client on purpose: they are measurements
            // of the user's OWN store, and WP-C lets them correct any we got
            // wrong. `fallbacks` is what that UI keys off.
            design_tokens: {
              // The MEASUREMENT, never the corrected result. Writing the merged
              // tokens back here destroyed the distinction the whole feature
              // rests on: applyTokenOverrides strips corrected paths from
              // `fallbacks`, so the editor then labelled a value the merchant
              // typed as "✓ measured" and the readout claimed we had read it
              // off their page. Corrections live in token_overrides.
              ...measured,
              diagnostics: {
                matchedButtonSelector: raw.matchedButtonSelector,
                buttonWasVisible: raw.buttonWasVisible,
                matchedAnchorSelector: injected.anchor,
                // How much of the block the proof shot actually shows. A run
                // that couldn't get the whole thing in frame still reaches
                // `ready`, so without this the shortfall left no trace at all
                // beyond a log line nobody reads.
                blockVisiblePx: framed.visiblePx,
                blockHeightPx: framed.height,
              },
            },
            preview_before_url: beforeUrl,
            preview_after_url: afterUrl,
            status: "ready",
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId);

        browserOk = true;
        /**
         * One line per preview with the time each phase took.
         *
         * "The preview is slow" is not actionable; "ready 12004ms" is — that
         * single number is what turned a vague complaint into the two-phase
         * wait above. Kept in production because the phase that dominates
         * varies by store, and averages hide it.
         */
        console.log(
          `[blocks] preview ${projectId} — launch ${phase.launch ?? 0}ms${phase.cold ? " (cold)" : " (warm)"} · nav ${phase.nav ?? 0}ms · ready ${phase.ready ?? 0}ms · tokens ${phase.tokens ?? 0}ms · inject ${phase.inject ?? 0}ms · capture ${phase.capture ?? 0}ms · blocked ${blockedCount} req`,
        );
        return { fallbacks: tokens.fallbacks.length };
      } finally {
        /**
         * Recorded BEFORE the browser is closed, and awaited.
         *
         * Before the close, because `browser.close()` has no timeout: a wedged
         * Chromium hangs there and the cost row would be lost in exactly the
         * expensive case it exists to capture. The few milliseconds of teardown
         * that go unmeasured are a far better trade.
         *
         * Awaited, because this is the last thing the step does. `recordUsage`
         * detaches its insert, which is right when more work follows — but here
         * the handler returns, the route responds, and the instance can be
         * frozen before a real network round-trip completes. The one row this
         * work package exists to write would be the one most likely to vanish.
         * `recordUsageNow` never rejects, so awaiting it in a `finally` cannot
         * mask the error that brought us here.
         *
         * On the failure path too: a run that died after launching still spent
         * the compute, and a feature whose cost only appears when it succeeds
         * understates precisely the store worth watching — the one that times
         * out every time.
         */
        await recordBrowserCost({
          userId,
          plan: (plan as PlanTier | null | undefined) ?? null,
          projectId,
          durationMs: Date.now() - browserStartedAt,
          succeeded: browserOk,
        });
        if (page) await page.close().catch(() => {});
        if (releaseBrowser) await releaseBrowser();
        else await closeQuietly(browser);
      }
    });
  },
);
