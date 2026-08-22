import type { Browser, Page } from "puppeteer-core";
import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { enterMeter } from "@/lib/usage/context";
import type { PlanTier } from "@/lib/supabase/types";
import { validatePublicStoreUrl } from "@/lib/security/url-guard";
import {
  launchBlocksBrowser,
  closeQuietly,
  BLOCKS_USER_AGENT,
  BLOCKS_VIEWPORT,
} from "@/lib/blocks/browser";
import {
  collectDesignTokens,
  injectBlock,
  removeBlock,
  scrollToAnchor,
  ANCHOR_SELECTORS,
  BUY_BUTTON_SELECTORS,
  CONTAINER_SELECTORS,
  SURFACE_SELECTORS,
} from "@/lib/blocks/collect-tokens";
import { normalizeDesignTokens } from "@/lib/blocks/design-tokens";
import { renderBlock } from "@/lib/blocks/render-block";
import type { BlocksProduct } from "@/lib/blocks/product-json";
import { startDeadline } from "@/lib/deadline";

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
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 45_000;
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

/** Pixels of context above the anchor, so the "before" shot shows the seam. */
const ANCHOR_OFFSET_PX = 220;

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
  if (/timeout|Navigation timeout|budget exhausted/i.test(msg)) {
    return "Your product page took too long to load for us to measure it. Try again — if it keeps happening, the store may be blocking automated browsers.";
  }
  return "We couldn't build the preview for that page. Try again in a minute.";
}

async function shoot(page: Page): Promise<Buffer> {
  const shot = await page.screenshot({ type: "jpeg", quality: 82, fullPage: false });
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
        .select("product_url, product_json")
        .eq("id", projectId)
        .single();
      if (!project) throw new Error(`blocks project ${projectId} not found`);

      const row = project as unknown as {
        product_url: string;
        product_json: (BlocksProduct & { currency: string | null }) | null;
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
      try {
        browser = await launchBlocksBrowser();
        const page = await browser.newPage();
        await page.setUserAgent(BLOCKS_USER_AGENT);
        await page.setViewport(BLOCKS_VIEWPORT);
        // The store's own scripts are what produce the computed styles we're
        // here to read, so JS stays ON. Only the page's own noise is skipped.
        page.setDefaultTimeout(Math.min(NAV_TIMEOUT_MS, dl.remaining()));

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
        await new Promise((r) => setTimeout(r, 1_200));

        dl.assert("blocks-calibrate");

        // ── 1. Calibration ────────────────────────────────────────────────
        const raw = await page.evaluate(collectDesignTokens, {
          buttonSelectors: BUY_BUTTON_SELECTORS,
          surfaceSelectors: SURFACE_SELECTORS,
          containerSelectors: CONTAINER_SELECTORS,
          anchorSelectors: ANCHOR_SELECTORS,
        });
        const tokens = normalizeDesignTokens(raw);

        // ── 2. Framing ────────────────────────────────────────────────────
        // Scroll BEFORE the "before" shot and leave it there. The block is
        // inserted after the anchor, so nothing above moves and the two images
        // are a true comparison rather than two differently-shifted pages.
        await page.evaluate(scrollToAnchor, {
          anchorSelectors: ANCHOR_SELECTORS,
          offsetPx: ANCHOR_OFFSET_PX,
        });
        await new Promise((r) => setTimeout(r, 400));

        const before = await shoot(page);

        // ── 3. Injection + after ──────────────────────────────────────────
        const rendered = renderBlock({
          spec: { type: "product_facts" },
          tokens,
          product: row.product_json,
          currency: row.product_json.currency ?? null,
        });
        const injected = await page.evaluate(injectBlock, {
          html: rendered.html,
          css: rendered.css,
          anchorSelectors: ANCHOR_SELECTORS,
          styleId: STYLE_ID,
        });
        if (!injected.ok) {
          throw new Error("We couldn't find a place on that page to put the block.");
        }
        await new Promise((r) => setTimeout(r, 400));
        const after = await shoot(page);

        // Leave the page as we found it. Costs nothing and means a future step
        // added to this session can't inherit a mutated DOM.
        await page.evaluate(removeBlock, STYLE_ID).catch(() => undefined);

        dl.assert("blocks-upload");

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
              ...tokens,
              diagnostics: {
                matchedButtonSelector: raw.matchedButtonSelector,
                matchedAnchorSelector: injected.anchor,
              },
            },
            preview_before_url: beforeUrl,
            preview_after_url: afterUrl,
            status: "ready",
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId);

        return { fallbacks: tokens.fallbacks.length };
      } finally {
        await closeQuietly(browser);
      }
    });
  },
);
