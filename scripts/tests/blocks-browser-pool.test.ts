import { test } from "node:test";
import assert from "node:assert/strict";
import type { Browser } from "puppeteer-core";
import { createBrowserPool, type BrowserPoolDeps } from "../../lib/blocks/browser-pool";

/**
 * Liquid Blocks WP-F.5 — the warm-browser state machine.
 *
 * Warm reuse is the single biggest latency win in this feature, and it is also
 * the only place where two previews touch the same object. Everything that can
 * go wrong here goes wrong as "a browser closed underneath a run that was still
 * using it", which surfaces to the merchant as a preview that failed for no
 * visible reason.
 *
 * These tests exist because the review found two such bugs by READING. Nothing
 * could execute this path without launching a real Chromium, so the factory now
 * takes its dependencies and the tests drive it with fakes.
 */

/** A stand-in browser. Only identity and closed-ness matter to the pool. */
function fakeBrowser(id: string) {
  return { id, closed: false } as unknown as Browser & { id: string; closed: boolean };
}

function harness(over: Partial<BrowserPoolDeps> = {}) {
  const launched: (Browser & { id: string; closed: boolean })[] = [];
  const closed: string[] = [];
  let n = 0;
  const timers: (() => void)[] = [];

  const deps: BrowserPoolDeps = {
    launch: async () => {
      const b = fakeBrowser(`b${++n}`);
      launched.push(b);
      return b;
    },
    close: async (b) => {
      if (b) {
        (b as unknown as { closed: boolean }).closed = true;
        closed.push((b as unknown as { id: string }).id);
      }
    },
    isAlive: async () => true,
    idleMs: 1_000,
    // Captured rather than scheduled, so a test fires the idle sweep on demand
    // instead of sleeping. Timing-based tests here would be flaky by design.
    setTimer: (fn) => {
      timers.push(fn);
      return { unref() {} } as unknown as NodeJS.Timeout;
    },
    ...over,
  };
  return { deps, launched, closed, fireIdle: () => timers.splice(0).forEach((f) => f()) };
}

test("two concurrent acquires share one browser and launch it once", async () => {
  const { deps, launched } = harness();
  const pool = createBrowserPool(deps);

  const [a, b] = await Promise.all([pool.acquire(), pool.acquire()]);

  assert.equal(launched.length, 1, "a second launch would double the memory ceiling");
  assert.equal(a.browser, b.browser);
  assert.equal(pool.leaseCount(), 2);
  // Only the caller that actually paid for the launch may report a cold start,
  // or the phase timings blame startup cost on a run that was handed a warm one.
  assert.deepEqual([a.coldStart, b.coldStart].filter(Boolean).length, 1);
});

test("releasing the same lease twice does not close a browser another run holds", async () => {
  /**
   * The bug this pins: `leases` was clamped at zero but no decrement was bound
   * to the lease that earned it, so a retry or a duplicated `finally` dropped
   * the count while a second preview was mid-run — and the idle sweep then
   * closed the browser out from under it.
   */
  const { deps, closed, fireIdle } = harness();
  const pool = createBrowserPool(deps);

  const a = await pool.acquire();
  const b = await pool.acquire();

  await a.release();
  await a.release();
  await a.release();

  assert.equal(pool.leaseCount(), 1, "lease B must still be counted");
  fireIdle();
  assert.deepEqual(closed, [], "B's browser was closed while B was still using it");

  await b.release();
  fireIdle();
  assert.equal(closed.length, 1, "once nobody holds it, the idle sweep may close it");
});

test("a dead browser is replaced and the dead handle is closed, not orphaned", async () => {
  const { deps, launched, closed } = harness();
  let alive = true;
  const pool = createBrowserPool({ ...deps, isAlive: async () => alive });

  const first = await pool.acquire();
  await first.release();

  alive = false;
  const second = await pool.acquire();

  assert.equal(launched.length, 2, "a dead browser must not be handed out again");
  assert.notEqual(second.browser, first.browser);
  // Dropping the handle without closing leaks an OS process that may be
  // unresponsive rather than exited.
  assert.deepEqual(closed, ["b1"]);
});

test("a slow health check cannot wipe the browser a faster caller installed", async () => {
  /**
   * The leak this pins. Two callers health-check the same dying browser; the
   * slow one resolves after the fast one has already relaunched, and the old
   * code ran `shared = null` unconditionally — discarding the FRESH browser
   * with no handle left to close it. In a feature whose ceiling is memory,
   * that is a Chromium nobody can ever reclaim.
   */
  const { deps, launched } = harness();
  let openGate = () => {};
  const gate = new Promise<void>((r) => { openGate = r; });
  let checksOfB1 = 0;

  const pool = createBrowserPool({
    ...deps,
    // b1 is the dying one. Everything launched after it is healthy — otherwise
    // the fake, not the code, would force a relaunch on every acquire.
    isAlive: async (b) => {
      if ((b as unknown as { id: string }).id !== "b1") return true;
      if (++checksOfB1 === 1) {
        // The slow checker: parked until the test releases it, so it resolves
        // AFTER the fast one has already relaunched.
        await gate;
      }
      return false;
    },
  });

  // Seed b1 and let go of it, so both racing callers find it as `shared`.
  const seed = await pool.acquire();
  await seed.release();

  const slow = pool.acquire();
  // Park the slow checker inside isAlive before the second caller arrives.
  await new Promise((r) => setImmediate(r));
  const fast = pool.acquire();
  const fastLease = await fast;      // relaunches b2 and installs it
  openGate();                        // now let the stale check finish
  await slow;

  assert.equal(launched.length, 2, "exactly one relaunch was warranted");

  /**
   * The decisive check: the browser the pool still HOLDS is the one it handed
   * out. With the old unconditional `shared = null`, the slow checker wiped b2
   * on its way past, so this acquire would launch a third browser and b2 would
   * be unreachable — a live Chromium with no handle left to close it.
   */
  const next = await pool.acquire();
  assert.equal(next.browser, fastLease.browser);
  assert.equal(launched.length, 2, "a third launch means browser #2 was orphaned");
});

test("releaseAll closes the browser and resets the lease count", async () => {
  const { deps, closed } = harness();
  const pool = createBrowserPool(deps);

  await pool.acquire();
  await pool.acquire();
  await pool.releaseAll();

  assert.equal(pool.leaseCount(), 0);
  assert.deepEqual(closed, ["b1"]);
});

test("the idle sweep spares a browser that was picked up again in the meantime", async () => {
  const { deps, closed, fireIdle } = harness();
  const pool = createBrowserPool(deps);

  const a = await pool.acquire();
  await a.release();          // arms the idle timer
  const b = await pool.acquire(); // picks it back up before the timer fires

  fireIdle();
  assert.deepEqual(closed, [], "the sweep must re-check the lease count when it fires");
  assert.equal(b.browser, a.browser);
});
