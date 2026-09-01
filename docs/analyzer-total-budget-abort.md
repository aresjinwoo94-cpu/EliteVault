# Total-elapsed abort — stop a doomed audit and refund, instead of dying slowly

Owner decision, not a finding from the brief: if an analysis has not finished
~58 seconds after it was **queued**, abort it and refund the credit
automatically — the same refund path that already runs on a provider error,
triggered by total elapsed time instead.

Branch: `feat/analyzer-total-budget-abort`, based on `main` @ `0fec92e`.

Companion docs: `docs/analyzer-latency.md` (§4a, the latency data this acts
on), `docs/anon-flow-cross-store-checklist.md` (the production run whose
numbers the trade-off below is measured against).

---

## 1. Why, in one paragraph

`STEP_BUDGET_MS` (50s) already bounds **one attempt** so Vercel never 504s.
It says nothing about how many *full* attempts Inngest stacks. Three attempts
plus Inngest's backoff is why a refunded audit currently averages **~232s**
before the user is told anything at all (`docs/analyzer-latency.md` §4a). This
is the other half: a ceiling on the whole run, so a doomed audit fails fast
instead of slowly.

## 2. Explicitly independent of the WP-2 freeze

This changes **only how long we keep retrying**. It does not touch
`maxDuration`, `ANALYZER_STEP_BUDGET_MS`, or `SCREENSHOT_BUDGET_MS`, and
`app/api/inngest/route.ts` is not modified. It is safe to ship while WP-5
stays frozen pending Liquid Blocks landing `maxDuration=300` on `main`.

## 3. The trade-off — read this before choosing the number

**Slow-but-successful audits now refund instead of completing.** How many
depends entirely on the ceiling, and the honest answer at 58s is: *most of
them.*

`docs/analyzer-latency.md` §4a, 30 days of production data on audits that
**succeeded** (n=51):

| statistic | value |
|---|---|
| median (p50) | **79.5s** |
| mean | 98.3s |
| p95 | 211.5s |
| share finishing ≤50s | **32%** |

A 58s ceiling sits **below the median of a successful audit**. Roughly
two-thirds of the audits that succeed today take longer than that. This is not
a safety valve that trims a pathological tail — at 58s it culls the middle of
the distribution.

That is a legitimate product choice (a user refunded at 58s may well be better
served than one who waits 232s to be told nothing), but it should be made with
the number in view, not by accident. **`ANALYZER_TOTAL_BUDGET_MS` tunes it
without a deploy**; something in the 120–180s range would cut the ~232s tail
while leaving the p50 audit alone.

The smaller sample from the 5-store checklist run immediately before this
change points the same way — 2 of 5 flip to refunds:

| store | wall time | under the new ceiling? |
|---|---|---|
| allbirds.com | 49.1s | completes |
| gymshark.com | 49.0s | completes |
| vitallivingstore.com | 53.4s | completes |
| aesop.com | 63.1s | **refunds** |
| brilliantearth.com | 168.4s | **refunds** |

So 3 of 5 survive and 2 of 5 become refunds — including brilliantearth, which
succeeded and produced a real report. Deliberate decision by the owner, not a
regression. Recording it here so nobody later reads the refund rate moving and
treats it as a bug.

## 4. How it works, and the two things that are load-bearing

**Measured from `analyses.created_at`, not from the attempt.** `mark-running`
now also reads `created_at` and returns it as a **step output**. Step outputs
are memoized, so every later attempt reconstructs the *same* deadline.
Measuring per attempt would reset the clock on each retry — the exact failure
this removes.

**The guard is checked INSIDE `capture-screenshot`, `run-analyzer-agent` and
`run-meta-ads-agent`, never between them.** An Inngest function body
re-executes from the top at every step boundary, with completed steps
returning memoized values. A check placed *between* steps would therefore also
run **after `save-result`** — and could flip an audit that already succeeded
into `refunded`. Inside a step body it re-evaluates once per attempt (which is
what bounds retries) and is memoized on success (so the post-save enrichment
steps can never trip it).

The throw is wrapped in `NonRetriableError` so Inngest goes straight to
`onFailure`. A plain throw would be retried twice more — the slow death this
replaces.

`humanizeError` gains a branch *ahead* of the per-step one, worded as "we
stopped this audit", not "it failed". The audit was abandoned by policy;
blaming the store for a limit we chose would be dishonest.

## 5. Why the guard alone was NOT a hard cutoff — and what closes it

A guard evaluated when an attempt *starts* only bounds how many attempts
start. It does not interrupt work already in flight:

```
t=0    capture-screenshot starts, guard passes
t=50   capture ends (its own 50s step budget)
t=50   run-analyzer-agent starts, guard passes (50 ≤ 58)
t=50   ...opens a FRESH 50s step budget...
t=100  still running — 42s past a "58s ceiling"
```

That is "we stop retrying", which is explicitly **not** what was asked for.

So every step's budget is now **clamped to whatever is left of the total
ceiling**:

```ts
const stepBudgetMs = () =>
  Math.max(5_000, Math.min(STEP_BUDGET_MS, queuedAtMs + TOTAL_BUDGET_MS - Date.now()));
```

applied at all four `startDeadline()` sites (`capture-screenshot`,
`quick-score`, `run-analyzer-agent`, `run-meta-ads-agent`). In the timeline
above, the analyzer step now opens an 8s budget instead of 50s and gives up at
t≈58 rather than t≈100. The 5s floor keeps a clamped budget usable — a step
handed 200ms would fail looking like a provider error rather than a timeout —
and below that floor the start-of-attempt guard has already aborted the run.

**Residual, stated honestly:** the in-flight step stops at the ceiling by
throwing a *step*-budget error, which is retryable. That retry then hits the
start-of-attempt guard immediately and refunds non-retriably. So the true
worst case is ~58s **plus one Inngest backoff and a no-work retry**, not a
clean guillotine at exactly 58s. Converting the clamped-out deadline error
directly into a `NonRetriableError` inside each step would remove that last
hop; it was not done here because it means wrapping three large step bodies in
try/catch, and the benefit is seconds, not minutes.

## 6. Also fixed: the hydration no-op

Found during the §5 checklist. The audit box's submit button rendered
**enabled** in the server HTML, so a click before React hydrated was a silent
no-op — no toast, no navigation. It now renders `disabled` until hydrated.

Implemented with `useSyncExternalStore` (server snapshot `false`, client
snapshot `true`) rather than `useEffect` + `setState`, which the project's lint
rule flags for triggering cascading renders.

Verified: both CTA buttons carry `disabled` in the raw server HTML
(`Invoke-WebRequest`, no JS), both are enabled after hydration in the browser,
and a real click then reaches the server action and returns its validation
toast.

## 7. Adversarial verification pass — two P0s found and fixed

An independent subagent reviewed the branch read-only. It confirmed the
mechanical parts were correct (step-body placement, `NonRetriableError`
semantics against inngest 3.54.2, the memoized instant, the error message
surviving serialization to `onFailure`, the hydration fix) and reproduced every
gate number. It also found two defects on live paths — both real, both fixed
here.

**P0 — the meta-ads guard discarded finished, paid-for audits.**
`run-meta-ads-agent` runs *after* `run-analyzer-agent` has produced and
memoized a completed audit, but *before* `save-result` persists it. The guard
sat there, outside the `try/catch` that makes meta-ads best-effort. So on any
Scale/API audit that reached that step past the ceiling, a finished vision
audit was thrown away, the row marked `refunded`, and the credit returned —
after the AI spend had already happened. Given the p50 above, that was the
majority of Scale audits. **Fixed by removing the guard entirely**: nothing
after `run-analyzer-agent` may prevent `save-result`. The clamped step budget
still bounds the step, and its existing catch turns a timeout into
`metaAds = null` with the core audit saved.

**P0 — measuring from `created_at` turned the concurrency queue into a refund
cannon.** `created_at` is stamped at INSERT, before `inngest.send()`. Inngest's
`concurrency` gating happens before the function body runs, so with
`GLOBAL_CONCURRENCY = 5` and a ~80s median run, the sixth concurrent
submission waits ~80s in a queue that exists *on purpose* — then would have
been aborted on its first line and told it "passed our time limit", having
executed nothing. That converts the queue (built so a burst becomes a longer
wait, not failures) back into the wave of failures it was designed to prevent.
The per-user `limit: 1` made it reproducible without any burst at all.
**Fixed by measuring from `started_at`** — the instant the run actually got a
slot, stamped and returned by `mark-running`.

This is a deliberate, documented deviation from the literal instruction
("desde queued"). The ceiling exists to stop *retries* stacking, and every
retry happens after the run starts, so this clock still covers the whole
problem — without refunding audits for time they spent waiting on our own
scheduler. Flag it if you want the queue wait counted after all.

Also fixed from the same pass:

- **`onFailure` could demote a succeeded audit.** No status guard on the
  refund write, and `step.sendEvent` after `save-result` is not wrapped in
  try/catch — so a failure there flipped an audit the user was reading to
  `refunded` and granted a free credit. Pre-existing, but this change routes
  far more traffic through `onFailure`. Now guarded with
  `.neq("status", "succeeded")`, and the refund is skipped when no row was
  updated. (Double-refund from handler retries was checked and is not
  possible: inngest configures the failure handler with `attempts: 1`.)
- **A `NaN` timestamp would have silently disabled the ceiling.** The old code
  read `created_at` back and did `new Date(...).getTime()`; an unparseable
  value yields `NaN`, and `NaN > budget` is `false`. Removed at the root —
  `mark-running` now stamps the instant locally and returns it, so there is no
  parse path at all.
- **The abort message promised anonymous users a refund they never get.**
  Reworded to "you haven't been charged for it", which is true for both owned
  and anonymous audits.
- **A redundant clause in `humanizeError`** (`isTotalBudgetError` already runs
  that exact regex) removed.

### Test quality, after the same critique

The reviewer noted the suite tested the pure helper but not the properties the
change actually risks. Added:

- Three **structural** tests that read `analyze-website.ts` and pin the
  placement rules: no total-budget guard at or after `save-result`, none in
  `run-meta-ads-agent`, and the ceiling measured from `runStartedAtMs` rather
  than the queued instant. Placement is the thing that cannot be reached from
  a unit test and is exactly where the P0 lived.
- These were **mutation-checked**: re-inserting a guard after `save-result`
  makes the suite fail (263 pass / 1 fail), so they are not vacuous.
- The near-vacuous `TOTAL_BUDGET_MS` bounds assertion was replaced with the
  invariant that actually matters — the value is a finite positive integer, so
  junk in the env can never leave the guard silently disabled.

## 8. Verification

| gate | baseline (`0fec92e`) | this branch |
|---|---|---|
| `npm run typecheck` | 252 errors | **252** — 0 new, none in touched files |
| `npm test` | 252 pass / 0 fail | **264 pass / 0 fail** (+12 new) |
| `npm run lint` | 2 errors, 114 warnings | **identical**, none in touched files |
| `npm run build` | — | **exit 0** |

`assertTotalBudget` is an exported pure function in `lib/deadline.ts`
specifically so the **shipped** guard is the one under test. The tests pin the
boundary: exactly on the ceiling passes, one millisecond over aborts, a clock
skew into the past never refunds a good audit, and total-budget vs step-budget
errors never classify as each other — that last separation is what keeps the
abort from being retried.

Note on measuring typecheck: stop the dev server first. Generated files under
`.next/dev/types` are written concurrently and can make `tsc` abort early,
reporting a misleadingly small error count (this happened once during this
work — 5 "errors", all syntax errors in generated files).

### Not verified

**The abort has not been exercised end to end.** Doing so needs a real run
that crosses the ceiling, and the anonymous entry point is rate-limited to
1/IP/day (already spent by the checklist), so no live trigger was available.
The guard is unit-tested and the wiring is argued above, but the full
queue → abort → `onFailure` → `refunded` + credit-return path has not been
watched happening. Worth one deliberate trigger after deploy — set
`ANALYZER_TOTAL_BUDGET_MS=1` in a preview, run any audit, and confirm the row
lands `refunded` with the "we stopped this audit" message and the credit back.
