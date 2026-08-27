import "server-only";
import type { Browser } from "puppeteer-core";

/**
 * Liquid Blocks WP-B — a headless browser, for this feature only.
 *
 * # Why the Analyzer's capture chain can't do this job
 * `lib/screenshot-core.ts` goes through ScreenshotOne → thum.io → Microlink →
 * mshots. Those services return ONE THING: an image of the URL as it stands.
 * They can't run `getComputedStyle` and hand the values back, and they can't
 * inject our block before the shutter. Blocks needs both — the calibration IS
 * the product — so it needs a browser we control.
 *
 * This is additive. The Analyzer keeps its provider chain untouched; nothing
 * here is on its path.
 *
 * # Where the binary comes from
 * On Vercel, `@sparticuz/chromium-min` fetches a Chromium build from a URL at
 * cold start instead of shipping ~50MB inside the bundle. That URL is NOT
 * guessed: CHROMIUM_PACK_URL must be set, and its version must match the
 * installed `@sparticuz/chromium-min` major, or the binary won't run. Failing
 * loudly with that sentence beats a cryptic spawn error at 3am.
 *
 * Locally (and on any machine with a real Chrome), set BLOCKS_CHROME_PATH to
 * that Chrome and the serverless path is skipped entirely — the sparticuz build
 * is Linux-only and cannot run on the developer's Windows or macOS box.
 */

/** A desktop viewport. Matches the Analyzer's so captures are comparable. */
export const BLOCKS_VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };

/**
 * A real desktop Chrome UA. Themes and bot filters key off this heavily, and a
 * store that refuses us is a store we can't calibrate against.
 */
export const BLOCKS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export class ChromiumNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChromiumNotConfiguredError";
  }
}

export async function launchBlocksBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");

  // A locally installed Chrome wins whenever it's configured — it's the only
  // thing that works off-Linux, and it makes the pipeline runnable on a laptop.
  const localChrome =
    process.env.BLOCKS_CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (localChrome) {
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      defaultViewport: BLOCKS_VIEWPORT,
    });
  }

  const chromium = (await import("@sparticuz/chromium-min")).default;
  const packUrl = process.env.CHROMIUM_PACK_URL;
  if (!packUrl) {
    throw new ChromiumNotConfiguredError(
      "CHROMIUM_PACK_URL is not set. Liquid Blocks needs a Chromium build to " +
        "measure and render the preview: point it at the @sparticuz/chromium " +
        "release tarball whose version matches the installed " +
        "@sparticuz/chromium-min, or set BLOCKS_CHROME_PATH to a local Chrome.",
    );
  }

  const executablePath = await chromium.executablePath(packUrl);
  return puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    defaultViewport: BLOCKS_VIEWPORT,
  });
}

/** Close without letting a shutdown error mask the real one. */
export async function closeQuietly(browser: Browser | null): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch (err) {
    console.warn("[blocks] browser close failed:", (err as Error).message);
  }
}

/**
 * WP-F.5 — a Chromium kept alive between previews.
 *
 * Measured cost of a cold launch on a warm machine: ~1.1-1.3s, every single
 * run, before any of the work the merchant is waiting on begins. On a
 * serverless container that survives between invocations the same instance can
 * serve many previews, and locally — where the dev server runs for hours — it
 * is pure waste to pay it twice.
 *
 * # Why a singleton is safe here, and where the sharp edges are
 * Each preview opens its own PAGE and closes it; the browser outlives them.
 * That is the standard shape, and it holds because:
 *   - concurrency is already bounded (BLOCKS_CONCURRENCY, default 2), so this
 *     is at most a couple of pages at a time, not an unbounded pool;
 *   - a page carries its own cookies-free context per navigation for our
 *     purposes — we never log in, never persist state, and never reuse a page;
 *   - a browser that DIED (OOM-killed, container reaped, crashed on a hostile
 *     page) must not be handed to the next caller, so every acquisition
 *     health-checks it and relaunches on failure.
 *
 * The idle timer exists for the local case: a dev server left running overnight
 * should not hold a Chromium the whole time. On serverless the container is
 * frozen or reaped long before it fires, which is fine — the timer is a
 * courtesy, not a correctness requirement.
 */

let shared: Browser | null = null;
/** In-flight launch, so two concurrent previews don't start two browsers. */
let launching: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

/** How long an unused browser is kept before being released. */
const IDLE_MS = (() => {
  const raw = Number(process.env.BLOCKS_BROWSER_IDLE_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 5 * 60_000;
})();

/** Set BLOCKS_BROWSER_REUSE=0 to go back to a cold launch per run. */
function reuseEnabled(): boolean {
  return process.env.BLOCKS_BROWSER_REUSE !== "0";
}

/** How many previews are using the shared browser right now. */
let leases = 0;

function clearIdle(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleRelease(): void {
  clearIdle();
  if (!shared) return;
  idleTimer = setTimeout(() => {
    // Only if nothing picked it up in the meantime.
    if (leases === 0 && shared) {
      const dying = shared;
      shared = null;
      void dying.close().catch(() => {});
    }
  }, IDLE_MS);
  // Don't hold the process open just to close a browser later.
  idleTimer.unref?.();
}

/** True when the handle still refers to a live browser we can drive. */
async function isAlive(browser: Browser): Promise<boolean> {
  try {
    if (browser.connected === false) return false;
    await browser.version();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a browser to run one preview with, plus the release function to call when
 * done. The caller closes its PAGE; releasing does not close the browser.
 */
export async function acquireBlocksBrowser(): Promise<{
  browser: Browser;
  release: () => Promise<void>;
  /** True when this run paid for a cold launch. For the phase timings. */
  coldStart: boolean;
}> {
  if (!reuseEnabled()) {
    const browser = await launchBlocksBrowser();
    return {
      browser,
      release: async () => closeQuietly(browser),
      coldStart: true,
    };
  }

  clearIdle();
  let coldStart = false;

  if (shared && !(await isAlive(shared))) {
    // Died between runs — OOM, a reaped container, a page that took it down.
    // Dropping the handle is the whole point of the health check.
    console.warn("[blocks] shared browser was dead; relaunching");
    shared = null;
  }

  if (!shared) {
    // One launch even if several previews arrive at once.
    if (!launching) {
      coldStart = true;
      launching = launchBlocksBrowser().finally(() => {
        launching = null;
      });
    }
    shared = await launching;
  }

  leases++;
  const browser = shared;
  return {
    browser,
    coldStart,
    release: async () => {
      leases = Math.max(0, leases - 1);
      if (leases === 0) scheduleIdleRelease();
    },
  };
}

/** Drop the shared browser now. For tests and for a clean shutdown. */
export async function releaseSharedBrowser(): Promise<void> {
  clearIdle();
  leases = 0;
  const dying = shared;
  shared = null;
  if (dying) await closeQuietly(dying);
}
