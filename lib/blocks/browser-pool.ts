import type { Browser } from "puppeteer-core";

/**
 * The lease/health/idle state machine, with its dependencies passed in.
 *
 * Extracted from the module-level singleton so a test can drive it with fake
 * browsers. The two bugs fixed here — a double release closing a browser that
 * another preview was still using, and a slow health check wiping a fresh
 * handle — were both found by reading rather than by a test, because nothing
 * could exercise this without launching a real Chromium. Now it can, and the
 * production singleton below is one instance of this factory: the tested code
 * and the shipped code are the same code.
 */
export interface BrowserPoolDeps {
  launch: () => Promise<Browser>;
  close: (browser: Browser | null) => Promise<void>;
  /** Liveness probe. Bounded by the caller; see HEALTH_CHECK_MS. */
  isAlive: (browser: Browser) => Promise<boolean>;
  idleMs: number;
  /** Injected so a test can fire the idle timer without wall-clock waiting. */
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
}

export interface BrowserLease {
  browser: Browser;
  release: () => Promise<void>;
  /** True when this run paid for a cold launch. For the phase timings. */
  coldStart: boolean;
}

export interface BrowserPool {
  acquire: () => Promise<BrowserLease>;
  /** Drop the shared browser now. For tests and for a clean shutdown. */
  releaseAll: () => Promise<void>;
  /** Live lease count. Test introspection; nothing in the app reads it. */
  leaseCount: () => number;
}

export function createBrowserPool(deps: BrowserPoolDeps): BrowserPool {
  let shared: Browser | null = null;
  /** In-flight launch, so two concurrent previews do not start two browsers. */
  let launching: Promise<Browser> | null = null;
  let idleTimer: NodeJS.Timeout | null = null;
  /** How many previews are using the shared browser right now. */
  let leases = 0;

  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));

  function clearIdle(): void {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function scheduleIdleRelease(): void {
    clearIdle();
    if (!shared) return;
    idleTimer = setTimer(() => {
      // Only if nothing picked it up in the meantime.
      if (leases === 0 && shared) {
        const dying = shared;
        shared = null;
        void deps.close(dying);
      }
    }, deps.idleMs);
    // Do not hold the process open just to close a browser later.
    idleTimer.unref?.();
  }

  async function acquire(): Promise<BrowserLease> {
    clearIdle();
    let coldStart = false;

    /**
     * Health-check the handle we actually looked at, and clear only THAT one.
     *
     * `shared = null` used to run unconditionally after the await. Two callers
     * health-checking the same dying browser resolve at different times, so the
     * slow one wiped the fresh browser the fast one had already installed —
     * leaking a whole Chromium with no handle left to close it, in a feature
     * whose ceiling is memory. Narrow, and it is exactly the OOM/reaped-container
     * case this check exists for.
     */
    const candidate = shared;
    if (candidate && !(await deps.isAlive(candidate))) {
      if (shared === candidate) {
        console.warn("[blocks] shared browser was dead; relaunching");
        shared = null;
        // It may be unresponsive rather than exited. Dropping the handle
        // without this orphans a live OS process.
        void deps.close(candidate);
      }
    }

    if (!shared) {
      // One launch even if several previews arrive at once.
      if (!launching) {
        coldStart = true;
        launching = deps.launch().finally(() => {
          launching = null;
        });
      }
      shared = await launching;
    }

    leases++;
    const browser = shared;
    /**
     * One decrement per lease, however many times release() is called.
     *
     * The counter was clamped at zero but nothing bound a decrement to the lease
     * that earned it, so a double release — a retry, a duplicated finally —
     * dropped the count while another preview was still working. Reproduced:
     * with a short idle window, releasing lease A twice closed the browser out
     * from under lease B mid-run. The five-minute default hid it, and
     * BLOCKS_BROWSER_IDLE_MS is env-configurable, so an operator trimming it to
     * save memory would have armed the bug without touching code.
     */
    let released = false;
    return {
      browser,
      coldStart,
      release: async () => {
        if (released) return;
        released = true;
        leases = Math.max(0, leases - 1);
        if (leases === 0) scheduleIdleRelease();
      },
    };
  }

  return {
    acquire,
    releaseAll: async () => {
      clearIdle();
      leases = 0;
      const dying = shared;
      shared = null;
      if (dying) await deps.close(dying);
    },
    leaseCount: () => leases,
  };
}
