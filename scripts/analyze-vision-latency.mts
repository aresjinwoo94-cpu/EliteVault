/**
 * Can the wait be cut to ~30s? A projection from the MEASURED distribution.
 *
 * Usage:
 *   npx tsx --tsconfig scripts/tests/tsconfig.json scripts/analyze-vision-latency.mts
 *
 * Makes no network calls — it reasons over samples already collected by
 * scripts/measure-image-height.mts against the real 3-project key pool.
 *
 * # The question
 * Target is ~30s end to end. Capture is a measured 6-19s cold, orchestration is
 * a handful of Inngest round-trips, so the vision call has to land in roughly
 * 10-20s for a 30s audit. The measured vision distribution is enormously spread
 * on IDENTICAL input, so the question isn't "how do we make the call faster" —
 * nothing we feed it changes the time — it's "what do we do about the spread".
 *
 * # What this evaluates
 * Three strategies inside the SAME fixed 50s step budget:
 *   serial     one attempt, the whole budget          (today)
 *   capped     cut the first attempt at T, retry once
 *   hedged     fire two attempts at once, take the first that answers
 *
 * Hedging is the standard answer to a high-variance backend, and it's the only
 * one of the three that attacks the variance itself rather than rearranging it.
 *
 * # The assumption, stated up front
 * The hedged numbers assume two concurrent calls are INDEPENDENT draws. That
 * holds when the spread is per-request queueing; it does NOT hold when Google is
 * globally overloaded, and the same measurement run saw an explicit 503. So
 * treat the hedged column as an upper bound, and read the correlation
 * sensitivity printed underneath it.
 */

/**
 * Real vision-call durations, seconds, from run C of measure-image-height.mts:
 * 3 heights x 5 repeats, interleaved and paced, against 3 independent Google
 * projects. Values at the 50s budget are runs that were aborted, i.e. censored
 * observations — they took AT LEAST 50s, we don't know how much more.
 */
const SAMPLES = [
  7.4, 7.5, 7.6, 8.5, 13.6, 15.8, 25.2, 25.8, 30.4, 37.7, 46.1,
  50, 50, 50, 50,
];
const BUDGET = 50;
const CENSORED = (t: number) => t >= BUDGET;

/** Share of attempts that finish within `t` seconds. */
const within = (t: number) => SAMPLES.filter((s) => !CENSORED(s) && s <= t).length / SAMPLES.length;

console.log(
  `\n${SAMPLES.length} measured vision calls · ${SAMPLES.filter(CENSORED).length} hit the ${BUDGET}s budget\n`,
);

console.log("How often a single attempt finishes within…");
for (const t of [10, 15, 20, 25, 30, 40, 50]) {
  const p = within(t);
  console.log(
    `  ${String(t).padStart(3)}s  ${(p * 100).toFixed(0).padStart(3)}%  ${"█".repeat(Math.round(p * 40))}`,
  );
}

console.log("\n── strategies inside the same 50s step ──");
console.log(
  "strategy".padEnd(22) + "finishes".padStart(10) + "  ≤30s".padStart(8) + "   note",
);

// 1. Serial — today.
const serial = within(BUDGET);
console.log(
  "serial (today)".padEnd(22) +
    `${(serial * 100).toFixed(0)}%`.padStart(10) +
    `${(within(30) * 100).toFixed(0)}%`.padStart(8) +
    "   one attempt, whole budget",
);

// 2. Capped + retry: first attempt cut at T, one more with what's left.
for (const T of [20, 25, 30, 33]) {
  const rest = BUDGET - T;
  const p = within(T) + (1 - within(T)) * within(rest);
  const fast = within(Math.min(T, 30)) + (1 - within(T)) * within(Math.min(rest, 30));
  console.log(
    `capped ${T}s + retry`.padEnd(22) +
      `${(p * 100).toFixed(0)}%`.padStart(10) +
      `${(fast * 100).toFixed(0)}%`.padStart(8) +
      `   2nd attempt gets ${rest}s`,
  );
}

// 3. Hedged: two concurrent attempts, first answer wins.
const hedged = (t: number) => 1 - (1 - within(t)) ** 2;
console.log(
  "hedged x2".padEnd(22) +
    `${(hedged(BUDGET) * 100).toFixed(0)}%`.padStart(10) +
    `${(hedged(30) * 100).toFixed(0)}%`.padStart(8) +
    "   2x AI calls, independent draws",
);

console.log("\n── hedging if the two calls are NOT independent ──");
console.log("  correlation   finishes   ≤30s");
for (const rho of [0, 0.3, 0.6, 0.9]) {
  // Blend between independent (rho=0) and perfectly correlated (rho=1, i.e.
  // hedging buys nothing) — a deliberately crude interpolation, but it shows
  // how fast the benefit decays if Google is overloaded globally rather than
  // per-request.
  const blend = (t: number) => (1 - rho) * hedged(t) + rho * within(t);
  console.log(
    `  ${rho.toFixed(1).padStart(9)}   ${(blend(BUDGET) * 100).toFixed(0).padStart(6)}%   ${(blend(30) * 100).toFixed(0).padStart(4)}%`,
  );
}

console.log(
  `\nCeiling check: even a PERFECT strategy can't beat the fraction of attempts\n` +
    `that are physically fast. ${(within(15) * 100).toFixed(0)}% of single attempts land under 15s, which is\n` +
    `what a 30s end-to-end audit needs once capture (6-19s) is paid.\n`,
);
console.log(
  `Sample size is ${SAMPLES.length}. These are projections from real measurements, not a\n` +
    `live A/B. Any strategy chosen here still has to be measured after shipping.\n`,
);
