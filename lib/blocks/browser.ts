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
