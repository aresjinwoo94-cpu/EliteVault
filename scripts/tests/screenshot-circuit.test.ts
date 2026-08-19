import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  screenshotOneCircuit,
  captureScreenshot,
  captureWithScreenshotOne,
} from "../../lib/screenshot-core";

/**
 * WP-2 — the ScreenshotOne circuit breaker.
 *
 * On the free tier's 100-captures/month cap, every audit past it still pays a
 * full request just to be refused (~2s, doubled by the www-flip retry) before
 * degrading to thum.io. That time comes straight out of the 50s step budget the
 * vision call needs. These tests pin the two things that make the breaker safe:
 * it only ever skips a call we KNOW would fail, and it heals.
 */

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.SCREENSHOTONE_ACCESS_KEY;
const ORIGINAL_COOLDOWN = process.env.SCREENSHOTONE_EXHAUSTED_COOLDOWN_MINUTES;
const ORIGINAL_THUMIO = process.env.SCREENSHOT_DISABLE_THUMIO;

/** A capture-sized body — anything under 30KB is treated as a placeholder. */
const REAL_IMAGE = Buffer.alloc(200_000, 7);

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  screenshotOneCircuit.reset();
  process.env.SCREENSHOTONE_ACCESS_KEY = "test-key";
  delete process.env.SCREENSHOT_DISABLE_THUMIO;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  screenshotOneCircuit.reset();
  restoreEnv("SCREENSHOTONE_ACCESS_KEY", ORIGINAL_KEY);
  restoreEnv("SCREENSHOTONE_EXHAUSTED_COOLDOWN_MINUTES", ORIGINAL_COOLDOWN);
  restoreEnv("SCREENSHOT_DISABLE_THUMIO", ORIGINAL_THUMIO);
});

/** Records every URL requested and answers each provider plausibly. */
function stubFetch(handlers: {
  screenshotOne?: () => Response;
  thumIo?: () => Response;
}) {
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("api.screenshotone.com")) {
      return (
        handlers.screenshotOne?.() ??
        new Response(REAL_IMAGE, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })
      );
    }
    if (url.includes("image.thum.io")) {
      return (
        handlers.thumIo?.() ??
        new Response(REAL_IMAGE, {
          status: 200,
          headers: { "content-type": "image/png" },
        })
      );
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return seen;
}

const quotaExhausted = () =>
  new Response(JSON.stringify({ error_code: "screenshots_limit_reached" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });

test("an exhausted-quota response trips the breaker", async () => {
  stubFetch({ screenshotOne: quotaExhausted });
  await assert.rejects(() => captureWithScreenshotOne("https://store.com"));
  assert.equal(screenshotOneCircuit.isOpen(), true);
});

test("an ordinary failure does NOT trip it — only a stated quota does", async () => {
  // A 500 on one store says nothing about the account's remaining quota, and
  // skipping the best provider for 10 minutes over it would be a real
  // regression in capture QUALITY, not just speed.
  stubFetch({
    screenshotOne: () => new Response("upstream boom", { status: 500 }),
  });
  await assert.rejects(() => captureWithScreenshotOne("https://store.com"));
  assert.equal(screenshotOneCircuit.isOpen(), false);
});

test("while open, the next audit never calls ScreenshotOne at all", async () => {
  screenshotOneCircuit.trip();
  const seen = stubFetch({});
  const shot = await captureScreenshot("https://store.com");
  assert.ok(shot.base64.length > 0);
  assert.equal(
    seen.some((u) => u.includes("api.screenshotone.com")),
    false,
    "the breaker must skip the request, not just ignore its result",
  );
  // …and the audit still gets a real capture from the next provider.
  assert.ok(seen.some((u) => u.includes("image.thum.io")));
});

test("with quota available, behaviour is identical to before the breaker", async () => {
  const seen = stubFetch({});
  const shot = await captureScreenshot("https://store.com");
  assert.equal(shot.mediaType, "image/jpeg");
  assert.ok(seen[0].includes("api.screenshotone.com"));
  assert.equal(screenshotOneCircuit.isOpen(), false);
});

test("one exhausted audit spares every following audit the same refusal", async () => {
  const seen = stubFetch({ screenshotOne: quotaExhausted });
  await captureScreenshot("https://store.com"); // trips on the refusal
  const afterFirst = seen.filter((u) => u.includes("api.screenshotone.com")).length;
  // Even the FIRST exhausted audit stops after one refusal: the www-flip retry
  // can't succeed when the cap is per account rather than per host.
  assert.equal(afterFirst, 1);
  await captureScreenshot("https://other-store.com");
  const afterSecond = seen.filter((u) => u.includes("api.screenshotone.com")).length;
  assert.equal(afterSecond, afterFirst, "the second audit must not re-ask");
});

test("an unrelated failure still gets its www-flip retry", async () => {
  // The break after a failed capture must key off THIS error, not the shared
  // breaker: a concurrent audit in the same lambda could trip that between the
  // two attempts, and www.burrow.com → 500 / burrow.com → 200 is a real store
  // we'd otherwise lose to a hostname detail.
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("api.screenshotone.com")) {
      // A concurrent audit exhausts the quota between our two attempts.
      screenshotOneCircuit.trip();
      return new Response("upstream boom", { status: 500 });
    }
    return new Response(REAL_IMAGE, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  }) as typeof fetch;

  await captureScreenshot("https://www.store.com");
  const attempts = seen.filter((u) => u.includes("api.screenshotone.com"));
  assert.equal(attempts.length, 2, "the flipped-www host should still be tried");
});

test("the breaker heals on its own when the cooldown expires", async () => {
  // Self-healing matters: a topped-up plan must not stay locked out until the
  // lambda happens to cold-start.
  process.env.SCREENSHOTONE_EXHAUSTED_COOLDOWN_MINUTES = "0.001"; // 60ms
  screenshotOneCircuit.trip();
  assert.equal(screenshotOneCircuit.isOpen(), true);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(screenshotOneCircuit.isOpen(), false);
});

test("a later success closes the breaker early", async () => {
  // The offline library jobs call ScreenshotOne directly, so they can prove the
  // quota is back before the cooldown would have expired.
  screenshotOneCircuit.trip();
  stubFetch({});
  await captureWithScreenshotOne("https://store.com");
  assert.equal(screenshotOneCircuit.isOpen(), false);
});

test("cooldown 0 disables the breaker entirely", async () => {
  process.env.SCREENSHOTONE_EXHAUSTED_COOLDOWN_MINUTES = "0";
  screenshotOneCircuit.trip();
  assert.equal(screenshotOneCircuit.isOpen(), false);
});
