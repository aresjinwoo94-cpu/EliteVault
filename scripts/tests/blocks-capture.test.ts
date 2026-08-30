import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captureHeight, wasTruncated } from "../../lib/blocks/capture-bounds";

/**
 * WP-F.7 — the full-page capture, and the two things about it that can be
 * silently wrong.
 *
 * The preview stopped being a viewport crop centred on the block and became a
 * photograph of the whole product page, shown in a scroller. That is a better
 * picture and a worse failure mode: a capture that is too short, too tall, or
 * mismatched between the before and after shots still looks like a working
 * preview.
 */

test("the capture height never collapses and never runs away", () => {
  const VIEWPORT = 900;
  const MAX = 9000;

  // Ordinary page: photographed whole.
  assert.equal(captureHeight(4200, VIEWPORT, MAX), 4200);

  /*
   * Chromium REFUSES a zero-height clip, and a page can report one: a store
   * still hydrating, or a document whose body is absolutely positioned. A
   * preview that throws where it should have shown one viewport is a failure
   * the merchant sees and we cannot explain.
   */
  assert.equal(captureHeight(0, VIEWPORT, MAX), VIEWPORT);
  assert.equal(captureHeight(120, VIEWPORT, MAX), VIEWPORT);
  assert.equal(captureHeight(Number.NaN, VIEWPORT, MAX), VIEWPORT);
  assert.equal(captureHeight(Number.POSITIVE_INFINITY, VIEWPORT, MAX), VIEWPORT);

  // A long marketing page is capped rather than encoded whole.
  assert.equal(captureHeight(41_000, VIEWPORT, MAX), MAX);
  assert.ok(wasTruncated(41_000, VIEWPORT, MAX));
  assert.ok(!wasTruncated(4200, VIEWPORT, MAX));

  // Fractional heights are real — a page can report 3200.5.
  assert.equal(captureHeight(3200.5, VIEWPORT, MAX), 3201);
  assert.ok(Number.isInteger(captureHeight(3200.5, VIEWPORT, MAX)));

  // A max below one viewport is a misconfiguration, not a licence to return a
  // sliver: the viewport floor wins.
  assert.equal(captureHeight(5000, VIEWPORT, 100), VIEWPORT);
});

test("both shots of a pair are captured the same way", () => {
  /**
   * The before/after pair is only a comparison if the two shots were taken
   * identically. Reverting either one to the viewport `shoot()` would produce a
   * pair where one image is the whole page and the other is 900px of it — and
   * the toggle would read as though the block had transformed the entire
   * storefront.
   *
   * Checked at source level: there is no way to assert this from a unit test
   * without a browser, and the failure is a one-word edit.
   */
  const src = readFileSync(
    join(process.cwd(), "inngest/functions/blocks-preview.ts"),
    "utf8",
  );
  const captureSection = src.slice(
    src.indexOf("const captureStart = Date.now();"),
    src.indexOf("phase.capture = since(captureStart);"),
  );
  assert.ok(captureSection.length > 0, "the capture section moved — this test is stale");

  const fullPageShots = captureSection.match(/shootFullPage\(page[,)]/g) ?? [];
  assert.equal(
    fullPageShots.length,
    2,
    `expected both shots to be full-page, found ${fullPageShots.length}`,
  );
  assert.ok(
    !/\bawait shoot\(page[,)]/.test(captureSection),
    "one of the two shots reverted to a viewport crop",
  );
});

test("a run with no block chosen measures and captures nothing", () => {
  /**
   * The gate WP-F.7 is built on. Rendering `product_facts` as a stand-in put a
   * finished picture of a block the merchant never chose in front of them, and
   * charged a full Chromium capture for it on every first visit.
   *
   * Two things have to hold, and both are one edit away from not holding: the
   * function must return before the capture, and it must CLEAR the stored
   * image URLs — a leftover capture of a previous block sitting under "here is
   * your page" is exactly the quietly-wrong picture this feature replaces.
   */
  const src = readFileSync(
    join(process.cwd(), "inngest/functions/blocks-preview.ts"),
    "utf8",
  );

  /*
   * The pipeline must not NAME the stand-in block at all.
   *
   * The first version matched the literal expression
   * `block_spec ?? { type: "product_facts" }`. A verifier reinstated the exact
   * bug by adding a cast — the regex missed it, all three tests passed, and the
   * gate became unreachable while claiming to be guarded. Meanwhile a pure
   * refactor of the gate condition BROKE the test. Weak against the bug and
   * brittle against the refactor, which is the worst pair to be.
   *
   * A substring cannot be reformatted around: any reintroduction has to mention
   * the block type somewhere.
   */
  assert.ok(
    !src.includes("product_facts"),
    "the pipeline mentions product_facts again — the stand-in block is back",
  );

  const gateAt = src.indexOf("if (!spec) {");
  assert.notEqual(gateAt, -1, "the no-block gate is gone");
  const captureAt = src.indexOf("const captureStart = Date.now();");
  const renderAt = src.indexOf("renderBlock({");
  assert.notEqual(renderAt, -1, "renderBlock moved — this test is stale");
  assert.ok(gateAt < captureAt, "the gate must come before the capture");
  // Existing is not enough: it has to be reached before any work is done.
  assert.ok(gateAt < renderAt, "the gate must come before the block is rendered");

  /*
   * A measure-only run is a SUCCESSFUL run.
   *
   * `browserOk` is set on the full path, so the gate's early return recorded
   * every project's first run — the most common shape there is — as a failure.
   * The cost was right; the flag separating "this store times out every time"
   * from "this ran fine" was not.
   */
  assert.match(
    src.slice(gateAt, captureAt),
    /browserOk = true/,
    "a measure-only run is still recorded as a failed one",
  );

  const gate = src.slice(gateAt, src.indexOf("}", src.indexOf("return {", gateAt)));
  assert.match(gate, /preview_before_url: null/, "the stale before-image is not cleared");
  assert.match(gate, /preview_after_url: null/, "the stale after-image is not cleared");
  assert.match(gate, /status: "ready"/, "a measured-only run must still finish");
});
