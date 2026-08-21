/**
 * WP-C criterion 1 — the CAPTURE-side benchmark.
 *
 * Usage:
 *   npx tsx --tsconfig scripts/tests/tsconfig.json scripts/measure-capture-latency.mts
 *   REPEATS=5 npx tsx ... scripts/measure-capture-latency.mts
 *
 * NOT in `npm run test`: real network, and it spends ScreenshotOne quota.
 *
 * # Why this exists
 * scripts/measure-analyzer-latency.mts times the VISION call from a stored
 * screenshot, so it says nothing about capture — and capture is exactly what
 * WP-C proposed to tune (provider wait, SCREENSHOT_FULL_PAGE_MAX_HEIGHT). An
 * earlier conclusion drawn from that harness was retracted for precisely this
 * reason. This is the missing half.
 *
 * # Quota discipline
 * ScreenshotOne's free tier is 100 captures/month and the owner had 97 left.
 * A 5-store x 5-repeat run could burn a quarter of that, so this reads
 * /usage before and after and REPORTS the real cost. It also proves whether
 * ScreenshotOne's own `cache: true` makes repeats free — which decides whether
 * repeats are affordable at all.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const k = line.slice(0, line.indexOf("=")).trim();
  const v = line.slice(line.indexOf("=") + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const { captureScreenshot } = await import("../lib/screenshot-core");

/** The brief's five reference categories, one real store each. */
const STORES: { label: string; url: string }[] = [
  { label: "1 Shopify normal", url: "https://www.allbirds.com" },
  { label: "2 anti-bot (Cloudflare)", url: "https://www.aesop.com" },
  {
    label: "3 very tall PDP",
    url: "https://www.brilliantearth.com/Beveled-Edge-Matte-5.5mm-Wedding-Ring-in-14K-White-Gold-BE1D125-14KW/",
  },
  { label: "4 fast / light", url: "https://vitallivingstore.com" },
  { label: "5 heavy DTC", url: "https://www.gymshark.com" },
];

const REPEATS = Number(process.env.REPEATS) > 0 ? Number(process.env.REPEATS) : 5;

/**
 * COLD=1 appends a unique query param per run so no provider can serve a
 * cached copy.
 *
 * This matters more than it looks. ScreenshotOne sends `cache: true` with a 24h
 * TTL, so repeated captures of the SAME url return in ~0.2s and cost 0 quota —
 * which measures their CDN, not a capture. Real audits are almost always a URL
 * we've never seen, so the cold number is the one the product actually pays.
 *
 * The cost is real: every cold ScreenshotOne capture spends one of the 100
 * monthly free-tier captures, which is why this is opt-in rather than default.
 */
const COLD = process.env.COLD === "1";
const bust = (url: string, i: number) =>
  COLD
    ? `${url}${url.includes("?") ? "&" : "?"}evbench=${Date.now()}-${i}`
    : url;

async function quota(): Promise<number | null> {
  const key = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.screenshotone.com/usage?access_key=${key}`);
    if (!r.ok) return null;
    return (await r.json()).used ?? null;
  } catch {
    return null;
  }
}

/** Which provider served it — inferred from the log line each one emits. */
function providerOf(warnings: string[]): string {
  if (warnings.some((w) => w.includes("ScreenshotOne skipped"))) return "skipped→fallback";
  const failed = warnings.filter((w) => w.includes("failed"));
  if (failed.length === 0) return "ScreenshotOne";
  if (failed.some((w) => w.includes("thum.io"))) {
    return failed.some((w) => w.includes("Microlink")) ? "mshots/og" : "Microlink";
  }
  return "thum.io";
}

const usedBefore = await quota();
console.log(
  `\nScreenshotOne used before: ${usedBefore ?? "?"} / 100 · ${REPEATS} repeats per store` +
    ` · ${COLD ? "COLD (cache-busted — costs quota)" : "warm (provider caches allowed)"}\n`,
);
console.log(
  "store".padEnd(26) + "run".padStart(4) + "time".padStart(9) + "  size     provider",
);
console.log("─".repeat(76));

const results = new Map<string, number[]>();

for (const s of STORES) {
  results.set(s.label, []);
  for (let i = 1; i <= REPEATS; i++) {
    // captureScreenshot logs provider failures via console.warn; capture them
    // so the table can say WHICH provider actually served each run.
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (...a: unknown[]) => warnings.push(a.join(" "));

    const t = Date.now();
    let size = "—";
    let provider = "FAILED";
    try {
      const shot = await captureScreenshot(bust(s.url, i));
      size = `${Math.round((shot.base64.length * 0.75) / 1024)}KB`;
      provider = providerOf(warnings);
    } catch (err) {
      provider = `FAILED — ${(err as Error).message.slice(0, 28)}`;
    }
    const secs = (Date.now() - t) / 1000;
    console.warn = realWarn;

    results.get(s.label)!.push(secs);
    console.log(
      s.label.padEnd(26) +
        String(i).padStart(4) +
        `${secs.toFixed(1)}s`.padStart(9) +
        `  ${size.padEnd(8)} ${provider}`,
    );
  }
}

const usedAfter = await quota();

console.log("\n── per store: mean and p95 ──");
console.log("store".padEnd(26) + "mean".padStart(8) + "p95".padStart(8) + "  runs");
for (const [label, times] of results) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  // Nearest-rank p95. With n=5 that IS the max — stated plainly rather than
  // dressed up as a percentile estimate it can't be at this sample size.
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
  console.log(
    label.padEnd(26) +
      `${mean.toFixed(1)}s`.padStart(8) +
      `${p95.toFixed(1)}s`.padStart(8) +
      `  ${times.map((t) => t.toFixed(1)).join(", ")}`,
  );
}

const cost =
  usedBefore != null && usedAfter != null ? usedAfter - usedBefore : null;
console.log(
  `\nScreenshotOne used after: ${usedAfter ?? "?"} / 100` +
    (cost != null
      ? ` — this run cost ${cost} capture(s) for ${STORES.length * REPEATS} requests` +
        (cost < STORES.length * REPEATS
          ? " (their cache makes repeats cheaper than requests)"
          : "")
      : ""),
);
console.log(
  "\nNote: p95 at n=5 is the max observed. Treat it as an upper bound seen, not\n" +
    "a distribution estimate.\n",
);
