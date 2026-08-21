/**
 * WP-C — does image HEIGHT drive vision-call time?
 *
 * Usage:
 *   npx tsx --tsconfig scripts/tests/tsconfig.json scripts/measure-image-height.mts
 *
 * NOT in `npm run test`: real captures and real paid Gemini calls.
 *
 * # Why this is the experiment that matters
 * With maxDuration fixed at 60s (Vercel Hobby, and staying there), the only
 * levers are ones that reduce work INSIDE the budget. Measurement shows capture
 * costs 6-19s cold, so the rest of a 79.5s median audit is the vision call and
 * orchestration. docs/analyzer-latency.md has long asserted that "height is what
 * the vision call is both billed and timed on" — asserted, never measured.
 *
 * This measures it: the SAME page captured at two heights, then the same vision
 * call repeated on each. Two captures total (a few quota), and every repeat
 * reuses the captured bytes so the cost doesn't scale with n.
 *
 * A relative A/B is deliberately used rather than absolute timings: the local
 * key pool is a single free-tier key that rate-limits under bursts, so absolute
 * numbers here are not production numbers. The RATIO between two arms measured
 * under the same conditions is the part that survives that.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const k = line.slice(0, line.indexOf("=")).trim();
  const v = line.slice(line.indexOf("=") + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const { captureWithScreenshotOne } = await import("../lib/screenshot-core");
const { runAnalyzerAgent } = await import("../ai/agents/analyzer-agent");
const { STEP_BUDGET_MS } = await import("../lib/deadline");

/**
 * A tall DTC storefront that ScreenshotOne can actually serve.
 *
 * brilliantearth was the obvious candidate — it's the page the height cap
 * exists for — but ScreenshotOne answers `HTTP 500 host_returned_error` for it,
 * which is why the capture benchmark saw it fall through to thum.io. A store we
 * can't capture at a chosen height can't be used to measure height.
 */
const URL_UNDER_TEST = "https://www.gymshark.com";

/**
 * 4500 is today's default. The others bracket it to find the TALLEST image that
 * still fits the 50s budget — the point isn't "shorter is faster", it's how much
 * page coverage we can keep while still producing a report at all.
 */
const HEIGHTS = [4500, 3500, 2500];
const REPEATS = Number(process.env.REPEATS) > 0 ? Number(process.env.REPEATS) : 3;

const shots = new Map<number, { base64: string; kb: number }>();
for (const h of HEIGHTS) {
  const shot = await captureWithScreenshotOne(
    `${URL_UNDER_TEST}?evheight=${h}`,
    { fullPage: true, fullPageMaxHeight: h, timeoutMs: 45_000 },
  );
  shots.set(h, {
    base64: shot.base64,
    kb: Math.round((shot.base64.length * 0.75) / 1024),
  });
  console.log(`captured at ${h}px → ${shots.get(h)!.kb}KB`);
}

console.log(
  `\nEach vision call gets the real ${STEP_BUDGET_MS / 1000}s step budget.\n`,
);
console.log("height".padStart(7) + "run".padStart(5) + "time".padStart(9) + "  outcome");
console.log("─".repeat(58));

/**
 * INTERLEAVED, not arm-after-arm.
 *
 * The first version of this ran all of arm A then all of arm B, and arm B came
 * out slower — which was almost certainly the key's cooldown state, not the
 * image. `cooldownUntil` in ai/providers/gemini.ts is module-level, the local
 * pool is a single free-tier key, and a burst of calls degrades it. Running the
 * arms in sequence hands all of that degradation to whichever arm goes second.
 *
 * Alternating means both arms sit in the same part of that curve, so a
 * difference that survives is the image and not the schedule. The pause between
 * calls gives the key room to recover, for the same reason.
 */
const PAUSE_MS = Number(process.env.PAUSE_MS) >= 0 ? Number(process.env.PAUSE_MS) : 20_000;
const schedule: number[] = [];
for (let i = 0; i < REPEATS; i++) for (const h of HEIGHTS) schedule.push(h);

const times = new Map<number, number[]>();
for (const h of HEIGHTS) times.set(h, []);
{
  let n = 0;
  for (const h of schedule) {
    const i = times.get(h)!.length + 1;
    if (n++ > 0 && PAUSE_MS > 0) {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    const t = Date.now();
    let outcome = "ok";
    try {
      const audit = await runAnalyzerAgent({
        screenshotBase64: shots.get(h)!.base64,
        mediaType: "image/jpeg",
        url: URL_UNDER_TEST,
        siteInfo: null,
        deadlineAt: Date.now() + STEP_BUDGET_MS,
      });
      outcome = `${audit.top_fixes?.length ?? 0} fixes · ${audit.annotations?.length ?? 0} ann`;
    } catch (err) {
      outcome = `FAILED — ${(err as Error).message.slice(0, 26)}`;
    }
    const secs = (Date.now() - t) / 1000;
    times.get(h)!.push(secs);
    console.log(
      String(h).padStart(7) +
        String(i).padStart(5) +
        `${secs.toFixed(1)}s`.padStart(9) +
        `  ${outcome}`,
    );
  }
}

console.log("\n── result ──");
for (const h of HEIGHTS) {
  const ts = times.get(h)!;
  const ok = ts.filter((_, i) => true);
  const mean = ok.reduce((a, b) => a + b, 0) / ok.length;
  const p95 = [...ok].sort((a, b) => a - b)[
    Math.min(ok.length - 1, Math.ceil(0.95 * ok.length) - 1)
  ];
  console.log(
    `${String(h).padStart(5)}px · ${String(shots.get(h)!.kb).padStart(4)}KB · mean ${mean.toFixed(1)}s · p95 ${p95.toFixed(1)}s · ${ts.map((t) => t.toFixed(1)).join(", ")}`,
  );
}
console.log(
  "\nIf the shorter arm is not meaningfully faster, height is NOT the lever the\n" +
    "docs claim it is, and lowering the cap would cost report coverage for nothing.\n",
);
