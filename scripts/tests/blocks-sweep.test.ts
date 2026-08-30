import { test } from "node:test";
import assert from "node:assert/strict";
import { scrollThroughPage } from "../../lib/blocks/collect-tokens";

/**
 * The lazy-load sweep, and the only thing about it that can hang a preview.
 *
 * `scrollThroughPage` walks the product page top to bottom so lazy images enter
 * a viewport and load before the full-page capture photographs everything at
 * once. It is the reason a full-page shot is not half blank.
 *
 * It is also the one piece of this feature that can run forever. A verifier
 * proved it: a page appending 1200px per scroll event was still sweeping after
 * 30 seconds, at 387,600px and climbing. `page.evaluate` has no timeout —
 * `setDefaultTimeout` governs waitFor/goto only — and there is no deadline
 * assertion between the sweep and the screenshot, so a run like that holds a
 * Chromium page and one of two global concurrency slots until Vercel kills it
 * as an opaque 504. Two such stores take the feature down for everybody.
 *
 * It runs in the page and touches `window` and `document`, which is exactly why
 * it had no coverage. It needs almost nothing from either, so a stub is enough
 * to drive the real exported function rather than a copy of it.
 */

interface FakePage {
  /** Called on every scroll, so a test can grow the document like a real one. */
  onScroll?: (y: number) => void;
  scrollHeight: number;
}

/**
 * Install just enough of a browser for the sweep, run it, and clean up.
 *
 * Returns what happened, so the assertions are about behaviour rather than
 * about the stub.
 */
async function sweep(
  page: FakePage,
  args: { stepPx: number; stepMs: number; maxMs: number; maxSteps: number },
): Promise<{ scrolls: number[]; finalScrollBehavior: string }> {
  const scrolls: number[] = [];
  const style = { scrollBehavior: "smooth" };
  const globals = globalThis as unknown as Record<string, unknown>;
  const hadWindow = "window" in globals;
  const hadDocument = "document" in globals;

  globals.document = { documentElement: { style, get scrollHeight() { return page.scrollHeight; } } };
  globals.window = {
    scrollTo: (_x: number, y: number) => {
      scrolls.push(y);
      page.onScroll?.(y);
    },
  };

  try {
    await scrollThroughPage(args);
    return { scrolls, finalScrollBehavior: style.scrollBehavior };
  } finally {
    if (!hadWindow) delete globals.window;
    if (!hadDocument) delete globals.document;
  }
}

test("an ordinary page is swept end to end and returned to the top", async () => {
  const { scrolls, finalScrollBehavior } = await sweep(
    { scrollHeight: 4200 },
    { stepPx: 700, stepMs: 0, maxMs: 20_000, maxSteps: 60 },
  );

  assert.ok(scrolls.length >= 6, `only ${scrolls.length} steps for a 4200px page`);
  assert.equal(scrolls[0], 0, "the sweep must start at the top");
  assert.ok(
    scrolls.some((y) => y >= 4200 - 700),
    "the sweep never reached the bottom of the page",
  );
  assert.equal(scrolls.at(-1), 0, "the sweep must leave the page at the top");
  // A theme's own smooth scrolling is disabled for the sweep and must be put
  // back — we are a guest on this page.
  assert.equal(finalScrollBehavior, "smooth");
});

test("a page that grows faster than the sweep still terminates", async () => {
  /**
   * The hang, reproduced. Infinite scroll, a scroll-appended recommendation
   * rail, or a review widget that paginates on scroll: the document grows by
   * more than one step per step, so `y < scrollHeight` is never false.
   *
   * The step cap is what stops it. Without a bound this test does not fail —
   * it never returns.
   */
  const page = { scrollHeight: 3600 } as FakePage;
  page.onScroll = () => {
    page.scrollHeight += 1200;
  };

  const { scrolls } = await sweep(page, {
    stepPx: 700,
    stepMs: 0,
    maxMs: 20_000,
    maxSteps: 60,
  });

  assert.ok(page.scrollHeight > 40_000, "the stub did not actually grow the page");
  // 60 steps, plus the final scroll back to the top.
  assert.ok(scrolls.length <= 61, `sweep ran ${scrolls.length} steps past its cap`);
  assert.equal(scrolls.at(-1), 0, "even a bailed-out sweep returns to the top");
});

test("a page that is merely slow is bounded by the clock, not the step count", async () => {
  /**
   * The second bound, and it is not redundant. A page can grow slowly enough to
   * stay under the step cap while each step still costs real time — the cap
   * would then permit 60 × stepMs of waiting. The wall clock is what makes the
   * worst case a number rather than a product of two settings.
   */
  const page = { scrollHeight: 3600 } as FakePage;
  page.onScroll = () => {
    page.scrollHeight += 900;
  };

  const started = Date.now();
  const { scrolls } = await sweep(page, {
    stepPx: 700,
    stepMs: 8,
    maxMs: 120,
    maxSteps: 10_000,
  });
  const elapsed = Date.now() - started;

  assert.ok(scrolls.length < 10_000, "the step cap, not the clock, ended this sweep");
  // 120ms of sweeping, plus the fixed 300ms settle at the top, plus slack for a
  // loaded CI box.
  assert.ok(elapsed < 3_000, `sweep took ${elapsed}ms against a 120ms budget`);
});
