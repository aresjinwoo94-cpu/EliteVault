/**
 * Concurrency probe for the analyzer.
 *
 * Fires N audit requests at once through the public API and reports how the
 * service behaves: how many were accepted, how many were deduped by the reuse
 * guard, how many were rate-limited or refused, and the p50/p95 latency of the
 * ACCEPT step (which should stay in the hundreds of ms — the audit itself runs
 * as a background job, so a slow accept means the queue path regressed).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS SPENDS REAL MONEY AND REAL QUOTA.
 * Every accepted request deducts a credit, consumes a ScreenshotOne capture
 * (free tier: 100/month) and a Gemini vision call. It is deliberately
 * opt-in — run it against a staging project, or against prod only when you
 * mean to. It will refuse to start without EV_LOAD_TEST_CONFIRM=yes.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   EV_LOAD_TEST_CONFIRM=yes \
 *   EV_BASE_URL=https://elitevaultapp.com \
 *   EV_API_KEY=<Scale-plan API key> \
 *   EV_COUNT=10 \
 *   node scripts/load-test-analyzer.mjs
 *
 * By default it sends 10 DIFFERENT store URLs (distinct work — the real
 * concurrency test). Set EV_SAME_URL=1 to send the SAME url N times instead,
 * which tests the idempotency guard: exactly one should be accepted and the
 * rest returned as `reused`.
 */

const CONFIRM = process.env.EV_LOAD_TEST_CONFIRM === "yes";
const BASE_URL = process.env.EV_BASE_URL?.replace(/\/$/, "");
const API_KEY = process.env.EV_API_KEY;
const COUNT = Math.max(1, Number(process.env.EV_COUNT ?? 10));
const SAME_URL = process.env.EV_SAME_URL === "1";

if (!CONFIRM || !BASE_URL || !API_KEY) {
  console.error(
    "Refusing to run.\n" +
      "  EV_LOAD_TEST_CONFIRM=yes   (this spends credits + free-tier quota)\n" +
      "  EV_BASE_URL=https://...    (prefer a staging deployment)\n" +
      "  EV_API_KEY=...             (Scale-plan API key)\n" +
      "  EV_COUNT=10                (optional, default 10)\n" +
      "  EV_SAME_URL=1              (optional: test dedupe instead of load)",
  );
  process.exit(1);
}

/** Public, well-known DTC stores — real pages, varied page weight. */
const STORES = [
  "https://ridge.com",
  "https://bearaby.com",
  "https://hims.com",
  "https://aesop.com",
  "https://allbirds.com",
  "https://caraway.com",
  "https://brooklinen.com",
  "https://olipop.com",
  "https://ruggable.com",
  "https://dailyharvest.com",
  "https://blueland.com",
  "https://feals.com",
  "https://oura.com",
  "https://haus.com",
  "https://cometeer.com",
  "https://hexclad.com",
  "https://liquid-death.com",
  "https://parachutehome.com",
  "https://quip.com",
  "https://tushy.co",
];

const targets = Array.from({ length: COUNT }, (_, i) =>
  SAME_URL ? STORES[0] : STORES[i % STORES.length],
);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function fire(url) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/v1/analyses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url }),
    });
    const ms = Date.now() - started;
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error page */
    }
    return { url, ms, status: res.status, body };
  } catch (err) {
    return { url, ms: Date.now() - started, status: 0, body: { error: err.message } };
  }
}

console.log(
  `Firing ${COUNT} concurrent requests at ${BASE_URL}` +
    (SAME_URL ? " (same URL — dedupe test)" : "") +
    "\n",
);

const started = Date.now();
const results = await Promise.all(targets.map(fire));
const wall = Date.now() - started;

const accepted = results.filter((r) => r.status === 202);
const reused = results.filter((r) => r.body?.reused);
const rateLimited = results.filter((r) => r.status === 429);
const outOfCredits = results.filter((r) => r.status === 402);
const failed = results.filter(
  (r) => r.status >= 500 || r.status === 0,
);

const latencies = results.map((r) => r.ms).sort((a, b) => a - b);

for (const r of results) {
  const tag = r.body?.reused ? "REUSED" : String(r.status);
  console.log(
    `  ${tag.padEnd(7)} ${String(r.ms).padStart(5)}ms  ${r.url}` +
      (r.body?.error ? `  → ${r.body.error}` : ""),
  );
}

console.log(`
────────────────────────────────────────────
  requests        ${results.length}
  accepted (202)  ${accepted.length}
  reused          ${reused.length}
  rate-limited    ${rateLimited.length}
  out of credits  ${outOfCredits.length}
  server errors   ${failed.length}
  ────
  accept p50      ${percentile(latencies, 50)}ms
  accept p95      ${percentile(latencies, 95)}ms
  wall clock      ${wall}ms
────────────────────────────────────────────

  Accept latency should be well under 1s: POST only creates the job row and
  emits the Inngest event. The audits themselves are now queued (global +
  per-user concurrency on the function), so watch the Inngest dashboard for
  throughput, and scripts/debug-analyses.mjs for the terminal statuses. Zero
  server errors is the bar — a load-shed shows up as queueing, not as 5xx.
`);

if (failed.length > 0) process.exitCode = 1;
