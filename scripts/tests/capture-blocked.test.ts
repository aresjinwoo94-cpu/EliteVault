import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCaptureBlocked } from "../../lib/analyzer/challenge-detect";
import { AnalysisResultSchema, CaptureBlockedSchema } from "../../ai/schemas";

/**
 * WP-A — reconciling the two detection layers, and the schema contract that
 * carries layer 2.
 *
 * The ordering rule is the whole point: discovery's pre-check only sees what a
 * plain JS-less fetch received, while the capture providers drive real browsers
 * and routinely clear a challenge that pre-check tripped on. Getting the
 * precedence backwards would refuse to audit stores we CAN see, which is worse
 * than the bug being fixed.
 */

test("the model's verdict overrides a stale discovery pre-check", () => {
  // Discovery's plain fetch got challenged; the real browser got through. The
  // model saw the actual store, so the audit is valid.
  const r = resolveCaptureBlocked({
    fromModel: { detected: false },
    fromDiscovery: { challengeDetected: true, challengeVendor: "Cloudflare" },
  });
  assert.equal(r.blocked, false);
  assert.equal(r.vendor, null, "a cleared challenge must not leave a vendor behind");
});

test("the model can flag a block discovery never saw", () => {
  // The inverse: the fetch sailed through but the SCREENSHOT is an interstitial.
  const r = resolveCaptureBlocked({
    fromModel: { detected: true, reason: "Cloudflare 'Checking your browser' screen" },
    fromDiscovery: { challengeDetected: false },
  });
  assert.equal(r.blocked, true);
  assert.match(r.reason ?? "", /Checking your browser/);
});

test("discovery decides when the model stayed silent", () => {
  // Older analyses have no capture_blocked field at all; a detected challenge
  // is better than no explanation.
  const r = resolveCaptureBlocked({
    fromModel: null,
    fromDiscovery: { challengeDetected: true, challengeVendor: "DataDome" },
  });
  assert.equal(r.blocked, true);
  assert.equal(r.vendor, "DataDome");
});

test("an audit with neither signal is not blocked", () => {
  assert.equal(resolveCaptureBlocked({}).blocked, false);
  assert.equal(
    resolveCaptureBlocked({ fromModel: null, fromDiscovery: null }).blocked,
    false,
  );
  assert.equal(
    resolveCaptureBlocked({ fromModel: {}, fromDiscovery: {} }).blocked,
    false,
  );
});

test("a blocked verdict carries the vendor for the message", () => {
  const r = resolveCaptureBlocked({
    fromModel: { detected: true, reason: null },
    fromDiscovery: { challengeDetected: true, challengeVendor: "PerimeterX" },
  });
  assert.equal(r.blocked, true);
  assert.equal(r.vendor, "PerimeterX");
});

test("capture_blocked is OPTIONAL — old audits must still open", () => {
  // Making it required would fail validation on every analysis stored before
  // the field existed, and push healthy generations into the repair pass.
  const minimal = {
    category_scores: {
      cro_principles: 50,
      layout_proportion: 50,
      color_integration: 50,
      image_quality: 50,
      niche_coherence: 50,
      technical_optimization: 50,
    },
    buyer_persona_response: {
      headline: "Looks fine to me.",
      quotes: ["I'd probably buy this."],
      would_buy: true,
      reasons: [],
    },
    annotations: [],
    summary: "A perfectly ordinary audit stored before capture_blocked existed.",
    top_fixes: [],
  };
  const parsed = AnalysisResultSchema.safeParse(minimal);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  assert.equal(parsed.data?.capture_blocked, undefined);
});

test("the capture_blocked shape accepts what the prompt asks for", () => {
  assert.equal(CaptureBlockedSchema.safeParse({ detected: false }).success, true);
  assert.equal(
    CaptureBlockedSchema.safeParse({ detected: true, reason: "CAPTCHA page" }).success,
    true,
  );
  assert.equal(CaptureBlockedSchema.safeParse({ detected: true, reason: null }).success, true);
  // `detected` is the one thing that must be there — a reason without a verdict
  // is unusable.
  assert.equal(CaptureBlockedSchema.safeParse({ reason: "x" }).success, false);
  assert.equal(CaptureBlockedSchema.safeParse({ detected: "yes" }).success, false);
});
