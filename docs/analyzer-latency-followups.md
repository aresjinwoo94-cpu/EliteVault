# Latency follow-ups — what the data says, and the two levers that are blocked

Four questions asked after a real 140s audit. Answers below are measured
against production data, not re-derived from `docs/analyzer-latency.md`.

Base: `main` @ `f549544` (the 150s total-elapsed ceiling is live).

---

> **Superseded by the addendum at the end of this document.** §1 and §2 below
> record what could be established from this machine *before* the owner
> confirmed the key pool directly. The conclusion changed; the reasoning is
> kept because it explains why the script could not settle it.

## 1. Are there ≥2 independent Gemini keys in production? — CANNOT VERIFY FROM HERE

`scripts/gemini-pool-check.mts`, run against the only env this machine has:

```
Reading .env.local — found 1 key(s).

Fewer than 2 keys here, so there is nothing to compare. This is expected
for .env.local: the pool lives in Vercel. Pull the production env first —
  vercel env pull .env.production.local
```

The script's own method needs the production env, and it says so. This machine
has **no Vercel CLI, no `.vercel/project.json`, no stored CLI auth and no
`VERCEL_TOKEN`** — the same wall that blocks WP-5. Installing the CLI would not
help: it needs an interactive `vercel login`.

So O-2's August "verified independent" claim is **still unverified for today**,
and this pass could not change that. What is certain: locally there is exactly
one key.

**To close it, run two commands and paste the output:**

```bash
vercel env pull .env.production.local
ENV_FILE=.env.production.local npx tsx --tsconfig scripts/tests/tsconfig.json scripts/gemini-pool-check.mts
```

The script saturates one key until it 429s, then probes the others: a sibling
that also 429s shares the project and adds no quota.

## 2. Turn on `GEMINI_HEDGE_AFTER_MS=12000` — BLOCKED, and would be harmful if #1 is "one key"

Blocked twice over: it depends on #1, and setting a Vercel env var needs the
dashboard access this machine does not have.

Worth stating plainly, because it changes whether the answer to #1 is good
news: **with a single key the hedge is not neutral, it is negative.** The
second call would draw on the same project's quota and the same queue, so it
is not an independent draw — it doubles AI spend on the slow tail and adds
rate-limit pressure to the very pool that is already the bottleneck. The
code's own comment (`ai/providers/gemini.ts`) says the projected
73%→93% completion assumes independence, and that assumption is false with one
key.

So: confirm #1 first. If it comes back "1 key" or "keys share a project",
minting keys in **new Google projects** is the prerequisite, and it is the
bigger lever anyway.

## 3. Should `GLOBAL_CONCURRENCY` go up from 5? — NO. The queue is not the bottleneck.

This one is answerable from production data, and the answer is a clear no.

`analyses` rows carry `created_at` (queued), `started_at` (got a slot) and
`finished_at`, so queue wait and compute time separate cleanly. Last 36h:

| audit | queue | run | wall |
|---|---|---|---|
| **unitedbyblue.com — the 140s audit** | **0.8s** | **137.4s** | **138.2s** |
| succeeded, median (n=9) | 1.8s | 46.6s | 53.4s |
| succeeded, max | 26.9s | 141.5s | 168.4s |

**The 140s audit spent 0.8 seconds in the queue.** Essentially all of it was
the run itself. Raising `GLOBAL_CONCURRENCY` would not have moved that number
by any amount worth measuring.

The single-case evidence is the strongest part: **that audit, the one being
complained about, waited 0.8s.** No sampling argument is needed to conclude
concurrency did not cause it.

The aggregate is weaker and should not be leaned on. n=9 is small, and a
majority of it is the 5-store checklist — audits fired back-to-back by one
operator. That burst is the *worst* case for queueing, so it biases toward the
conclusion rather than against it (even under it the median wait was 1.8s), but
it is not organic traffic and the 26.9s max comes from the same burst. Treat
the table as "no evidence of a queueing problem", not as proof of its absence
under real load.

There is also a reason *not* to raise it while #1 is unresolved: concurrency
and the key pool are coupled. More simultaneous runs on one Google project's
quota means more 429s, more provider-side retry ladders, and a *slower* p50 —
the queue is currently absorbing that pressure on purpose. Raise the key pool
first; revisit concurrency only if queue wait actually starts showing up in
this table.

### Incidental finding: the 150s ceiling is firing in production, and overshooting as predicted

Four `www.youtube.com` audits between 19:42 and 19:57 UTC all refunded, with
**run times of 155.9s, 166.7s, 180.6s and 190.7s** against a 150s ceiling.

That is the ceiling working — and it is also the first production evidence of
the residual documented in `docs/analyzer-total-budget-abort.md` §5: the guard
stops the *next attempt*, and the in-flight step's clamped budget plus
`onFailure`'s writes carry it past the line. Overshoot observed: **6s to 41s**.
Worth knowing before anyone reads "150s" as exact.

(youtube.com is not a storefront, so those runs say nothing about store
latency — but they are a clean demonstration that the abort path fires on real
traffic.)

## 4a. Library free-tier cap — was spot-checked, now it is tested

The brief called this "never verified line by line". It **was** checked during
WP-1 and written up in `docs/anon-cta-seo-landings.md` §4, which corrected the
brief on where the rule lives: not client-side in
`components/library/library-view.tsx`, but server-side in the `searchLibrary`
action, over a `plan` the action resolves from the session rather than
accepting from the caller.

What was missing was coverage, so the rule is now extracted to
`lib/library/metrics-cap.ts` — the shipped path, not a copy — and pinned by
seven tests:

- Free unlocks **exactly 3**, and only `is_preselected` rows.
- A 4th preselected row stays locked.
- Unused slots never spill onto non-preselected stores.
- Pro and Scale unlock everything.
- Anonymous is the free case (the action's default), so logged-out visitors
  can never be handed full metrics by a default change.
- `null` / missing `is_preselected` coerces to "not preselected".
- The input rows are not mutated.

Extracting a rule buys testability and creates a new failure mode: the rule
can be perfectly correct and simply **not called**. Deleting that one line in
the action would leave every unit test above green, typecheck silent
(`metrics_locked` is optional on the row type) and the build silent
(`next.config.mjs` ignores both type and lint errors) — while every free user
saw every metric. Two structural tests now read the action's source and pin the
wiring: that `items = applyMetricsCap(items, plan)` is present, and that `plan`
is resolved from the session rather than accepted in `opts`.

Both were mutation-checked, and the first attempt **failed the check**: the
initial regex matched the commented-out call, so the guard passed while the
paywall was off. It now strips comments before matching, and re-running the
same mutation fails the suite.

One test asserts the plan table itself still reads Free = 3, paid = unlimited,
so if the product rule changes the suite fails loudly instead of quietly
testing a stale expectation.

## 4a-bis. The Library paywall was cosmetic — FIXED

Found by the adversarial review of this change, and the most important thing in
this document. What follows describes the defect; the fix and its verification
are at the end of this section.

`applyMetricsCap` decides a **boolean**, `metrics_locked`. It does not withhold
anything:

- `app/actions/search.ts:120` selects `metrics` for **all** rows regardless of
  plan, and the full object is serialized into the RSC payload for every card.
- `components/library/site-card.tsx:235,244` renders the real values —
  `m.roi.toFixed(1)`, `m.conv_rate`, `m.traffic_est` — and applies
  `blur-[3px]` when locked.

So a free user reads every paywalled number by opening devtools, or by
toggling off one CSS class. The gate is a visual treatment, not an
authorization boundary.

**Pre-existing — this change did not introduce it.** But it mattered here
precisely because this commit's premise is "the shipped rule is now under
test": the tests pinned *who gets `metrics_locked: true`*, which is correct and
worth pinning, while that flag controlled a blur and nothing else.

### FIXED — the owner chose the em dash

`applyMetricsCap` now returns `metrics: null` on every locked row, so the
numbers never leave the server; `WinningSiteCard.metrics` is nullable and
`site-card.tsx` renders `—` for each figure on a locked card. The value cells
also gate on `locked` directly rather than relying on `metrics` being absent —
defence in depth, so the UI still withholds the number if a future change ever
puts the data back on the wire.

**No blur.** The `blur-[3px]` on the value and its label is gone, and so is the
`select-none` that existed only to stop the blurred real numbers being copied.
Blurring an em dash obscures nothing and reads as a rendering glitch; the lock
overlay ("Unlock metrics with Pro") is what communicates that the card is
gated. Verified in the browser on a real Free session: **0 elements on the page
carry a blur filter**, the three unlocked cards show real values (`3.1%`,
`4.2x`, `480K`) and every locked card shows `— — — —`.

This brings the Library in line with `lib/library/niche-winners.ts`
`gateWinners()`, which already did it correctly (`winners: []` for Free, only a
row COUNT crossing the wire).

### Verified against the real payload, not the type

A free session was minted for the pre-existing synthetic account via the
Supabase admin API (no password involved), `/app/library` was fetched with that
cookie, and the RSC payload inspected. Rows were attributed **by domain** —
comparing bare values cannot distinguish a leak from two stores sharing a
`conv_rate` of 4.4.

| | payload with the fix | payload with the fix reverted |
|---|---|---|
| rows serialized | 48 | 48 |
| locked rows | 45 | 45 |
| **`metrics` objects sent** | **3** (= the unlocked count) | **48** |
| `metrics: null` sent | 45 | 0 |
| `conv_rate` occurrences | 3 | 48 |
| locked rows inspected | 13 | 13 |
| **leaks found** | **0** | **13 of 13** |

Reverted, the check prints the actual exposed data, e.g.
`caddislife.com metrics={"ctr":1.9,"roi":2.7,"conv_rate":2.2,"traffic_est":250000}`.

**Two false starts are worth recording, because both would have produced a
green result that meant nothing:**

1. The first check searched for `"conv_rate":4.3`. The RSC payload embeds
   *escaped* JSON (`\"conv_rate\":4.3`), so it matched nothing and reported
   "no leaks" **against the known-leaking code**. Same class of error as the
   regex that matched a commented-out call earlier in this branch.
2. The second searched bare values with no terminator, so `roi=4` matched
   `\"roi\":4.8` in a different row and invented 5 leaks that did not exist.

Only the domain-attributed version distinguishes the two states, and it was
confirmed to fail on the reverted code before being trusted.

### Also checked: the Analyzer's "Winners in your niche" teaser — already correct

The same audit was applied to the anon/free winners module in the Analyzer
report. It does **not** have this defect: `gateWinners()`
(`lib/library/niche-winners.ts:688-712`) returns `winners: []` for Free with
only `lockedCount` crossing the wire, and its docblock says so explicitly —
*"NONE of the real store data is sent to a Free client (winners: []), so there
is nothing to read in the RSC payload; only a row COUNT crosses the wire."*
No change needed there.

## 4b. A store that is NOT Shopify — done, two platforms

The previous checklist's five stores were all Shopify or Shopify-like, so
`lib/site-discovery.ts`'s `woocommerce | magento | bigcommerce` branches had
never been exercised end to end.

Candidates were screened first with the **exact regexes** from
`lib/site-discovery.ts:204-208`, so the platform verdict matched what the
analyzer's own discovery step would conclude, rather than spending an audit to
find out. Of seven probed, `natori.com` and `unitedbyblue.com` came back
Shopify, two 403'd, one was `custom`; two were genuinely non-Shopify:

| store | platform | queue | run | score | fixes | annotations | capture |
|---|---|---|---|---|---|---|---|
| porterandyork.com | **woocommerce** | 0.5s | 39.0s | 75 | 3 | 4 | ok |
| bulkapothecary.com | **bigcommerce** | 9.0s | 29.8s | 48 | 3 | 5 | ok |

Both produced full, real audits — screenshot captured, no `capture_blocked`,
findings and annotations present. Platform detection confirmed **from inside
the pipeline**, not inferred:

```
[discovery] https://porterandyork.com     → 3 pages, ... (woocommerce)
[discovery] https://www.bulkapothecary.com → 1 pages, ... (bigcommerce)
```

These times are **not** comparable to the production figures elsewhere in this
doc: they came from a local dev server on the single local key, so they say
nothing about whether either platform is faster or slower in production. They
are compatibility evidence only.

### What this run does NOT cover

- **Magento is still untested.** None of the probed candidates matched it.
- These went through the **pipeline**, not the production anonymous HTTP entry:
  the per-IP anon limit is back to 1/day and this IP had spent it, so the rows
  were inserted and `analysis/requested` sent directly, against a local dev
  server plus a local Inngest dev server, on the pre-existing synthetic account
  `test-pro@elitevault.local`. Discovery, capture, vision and persistence are
  the same code; the anon entry point and gating were already verified five
  times in `docs/anon-flow-cross-store-checklist.md`.
- Run times above therefore came from the **local single key**, not the
  production pool, so treat them as compatibility evidence rather than
  production latency.

### Rows left in production

Three test rows on the `test-pro@elitevault.local` account, left rather than
deleted: `d5cceaba-9329-4aac-829d-780845710434` (porterandyork),
`61cdfbfe-63ec-4ce3-adec-229a317e83e7` and one more bulkapothecary run
(it was executed twice). No credits were charged (`credits_charged: 0`).

---

---

# Addendum — the hedge, once the key pool was confirmed

The owner confirmed directly, as administrator of the Google Cloud accounts,
that all six production keys (`GEMINI_API_KEY` … `_6`) live in **six distinct
Google Cloud projects with no shared quota**. That could not be established
with `gemini-pool-check.mts`: all six are marked *Sensitive* in Vercel, which
permanently blocks reading the values back — not a limitation of the script and
not reachable via CLI or API. The confirmation is owner testimony, and it is
recorded as such rather than as a measurement.

With independence established, §2's objection ("with one key the hedge is
negative") no longer applies.

## Does the hedge require more than 60s in one invocation? — **No.**

This was the blocking question, and the answer is in the code, not in
reasoning by analogy. `ai/providers/gemini.ts:427-478`:

1. **It returns on the first SUCCESS, not on both.** `firstFulfilled(primary,
   hedge)` (`:199`) resolves as soon as either call fulfils, and rejects only
   if both reject. So on the success path the wall time is
   `min(t_primary, HEDGE_AFTER_MS + t_hedge)` — never *more* than the
   un-hedged call.
2. **It is deadline-aware and refuses to start when there isn't room.** The
   guard at `:434-438` skips hedging entirely unless
   `dl.has(HEDGE_AFTER_MS + MIN_CALL_MS)` — 12s + 8s = 20s of step budget must
   remain.
3. **Everything stays inside the same `Deadline`** the analyzer step already
   passes (`STEP_BUDGET_MS`, 50s, itself clamped by `TOTAL_BUDGET_MS`). The
   hedge does not widen that bound; it spends it differently.
4. **One call is already capped at 25s** (`CALL_CAP_MS`, `:183`).
5. **The loser is aborted** in `finally` (`:472-477`), so nothing keeps running
   after a winner returns.

The step therefore still cannot exceed its 50s budget, and `maxDuration = 60`
remains sufficient. **This is not coupled to WP-2 and does not need to wait for
Liquid Blocks.**

One honest caveat, on the *failure* path rather than the success path: if the
primary rejects quickly (say a 429 at t=3s), `firstFulfilled` deliberately does
not propagate that error while the hedge is still outstanding — so surfacing
the failure can be delayed by up to `HEDGE_AFTER_MS`. It remains bounded by the
deadline, and it is the intended trade (one bad draw must not decide the run),
but it is a reason not to set the value higher than necessary.

## Recommended starting value: `GEMINI_HEDGE_AFTER_MS=12000`

Chosen on the following reasoning rather than because the brief named it:

- **It must land before `CALL_CAP_MS` (25s).** A hedge that fires at 20s leaves
  the primary only 5s before it is killed, so the second draw is doing the work
  alone — most of the benefit is gone. 12s gives two overlapping draws covering
  roughly [0,25] and [12,37], both inside a 50s step.
- **It must land after the fast band.** The measured distribution has about a
  third of calls finishing under 15s; those pay nothing extra only if the hedge
  has not yet fired. 12s is slightly inside that band, which is the deliberate
  cost — see below.
- **The cost is real and worth stating**: at 12s the hedge fires on roughly
  two thirds of calls, so vision spend on those roughly doubles. Six
  independent free-tier projects (15 RPM each, ~90 RPM aggregate) is what makes
  that affordable, and is exactly the precondition that was missing before.
- **If AI spend turns out to matter more than latency**, 15000–18000 fires on
  materially fewer calls while still clearing the 25s cap. That is the dial to
  turn, and it needs no deploy.

## Before/after measurement — the named script cannot do this

`scripts/measure-analyzer-latency.mts` **cannot measure the hedge**, for a
reason that is structural rather than incidental:

- It loads `.env.local` (`:41-46`), which holds **one** key. With
  `CLIENTS.length < 2` the hedge branch at `:436` is skipped outright, so a
  local run measures the un-hedged path no matter what `GEMINI_HEDGE_AFTER_MS`
  is set to. The six real keys cannot be pulled down, being *Sensitive*.
- Its own "KNOWN LIMITS" header disqualifies it anyway for this purpose: it
  measures **the vision call only** (stored screenshot fixtures, so no capture,
  discovery or DB writes), runs **n=1 per cell**, leaks `cooldownUntil` module
  state between arms, and the header records two independent runs disagreeing
  (1/3 vs 2/3 completing). It ends: *"Fixing the first three is what would make
  this a real before/after harness."*

So the measurement has to come from production `analyses` rows —
`finished_at - started_at`, which is what `docs/analyzer-latency.md` §4a used
for its own baseline and what the brief itself asks to compare against.

### BEFORE baseline — measured, production, hedge OFF

Taken at `main` @ `f549544`, synthetic test-account rows excluded:

| window | status | n | mean | **p50** | p90 | **p95** | max |
|---|---|---|---|---|---|---|---|
| 30 days | succeeded | 61 | 70.9s | **50.5s** | 129.4s | **155.2s** | 179.2s |
| 30 days | refunded | 33 | 232.5s | 205.5s | 386.1s | 446.3s | 534.9s |
| 7 days | succeeded | 12 | 55.2s | **43.8s** | 137.4s | **141.5s** | 141.5s |
| 7 days | refunded | 4 | 173.5s | 180.6s | 190.7s | 190.7s | 190.7s |

**Success rate: 65% (61/94) over 30 days, 75% (12/16) over 7 days.**

Worth flagging: this is materially better than the figures the brief and
`docs/analyzer-latency.md` §4a quote (47% success, 79.5s p50). Those were an
August window. Anything comparing against 47%/79.5s today is comparing against
a stale baseline — the table above is the one to beat.

### AFTER — the protocol

1. Set `GEMINI_HEDGE_AFTER_MS=12000` in Vercel (Production) and redeploy; env
   changes only apply to new deployments.
2. Let it run for a week, or at least ~40 terminal audits — the 7-day cell
   above is n=16, too thin to move a p95 conclusion.
3. Re-run the same query and compare p50/p95 and success rate against the
   table above, not against the August numbers.
4. Reverting is a single env change; nothing here is a code path that needs
   removing.

The one thing to watch that is not latency: hedge firings are logged as
`[gemini] … slow past 12s — hedging onto key #N`. If that line appears on
nearly every call, the value is too low for the cost; raise it toward 18000.

## Where the typical-time lever actually is

Of everything available without WP-2:

| lever | verdict |
|---|---|
| `GLOBAL_CONCURRENCY` | **Not the cause of the 140s audit** (0.8s queue). No evidence of a queueing problem in the window, but n=9 |
| `GEMINI_HEDGE_AFTER_MS` | **Unblocked** — 6 independent projects confirmed by the owner. Recommend `12000`; safe under `maxDuration=60`. See the addendum |
| More Gemini keys, new Google projects | Already done — six, one project each |
| Image height / max tokens | Already disproven in `docs/analyzer-latency.md` §4b — do not re-spend that time |
| Step/screenshot budgets (WP-5) | Frozen pending Liquid Blocks landing `maxDuration=300` |

The honest summary: the one measurable thing this pass could act on
(concurrency) turned out not to be the problem, and the two that could move
the p50 both route through the Gemini key pool — which needs the owner's
Vercel access to even diagnose.

## Verification

| gate | baseline (`f549544`) | this branch |
|---|---|---|
| `npm run typecheck` | 252 errors | **252** — 0 new |
| `npm test` | 264 pass / 0 fail | **271 pass / 0 fail** (+7) |
| `npm run lint` | 2 errors, 114 warnings | **identical** |
| `npm run build` | — | **exit 0** |

`app/actions/search.ts` carries 13 of the 252 typecheck errors, all
pre-existing (the stale `Database` type — `Property 'plan' does not exist on
type 'never'`, `docs/infra-debt.md`). The new files
(`lib/library/metrics-cap.ts`, `scripts/tests/library-metrics-cap.test.ts`)
contribute zero.
