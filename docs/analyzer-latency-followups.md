# Latency follow-ups — what the data says, and the two levers that are blocked

Four questions asked after a real 140s audit. Answers below are measured
against production data, not re-derived from `docs/analyzer-latency.md`.

Base: `main` @ `f549544` (the 150s total-elapsed ceiling is live).

---

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

## 4a-bis. ⚠️ The Library paywall is cosmetic — the locked numbers ship to the browser

Found by the adversarial review of this very change, and it is the most
important thing in this document.

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

**Pre-existing — this change did not introduce it.** But it matters here
precisely because this commit's premise is "the shipped rule is now under
test": the seven tests above give the free/paid boundary a green checkmark it
has not earned. They pin *who gets `metrics_locked: true`*, which is correct
and worth pinning, but that flag currently controls a blur and nothing else.

**Not fixed here, because the fix is a product decision.** The mechanical part
is small — null out `metrics` server-side on locked rows before returning, so
the numbers never leave the server. What that should *look like* is not
mechanical: today the card shows real-but-blurred figures, which reads as "we
have this data". With the values withheld the card renders `—` under a blur,
which is a different (and more honest) teaser. That trade-off is the owner's
call, so it is flagged rather than unilaterally changed.

If the intent is genuinely to gate the data, the tests above should be extended
to assert that a locked row comes back with `metrics: null` — at which point
they would be pinning something real.

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

## Where the typical-time lever actually is

Of everything available without WP-2:

| lever | verdict |
|---|---|
| `GLOBAL_CONCURRENCY` | **Not the cause of the 140s audit** (0.8s queue). No evidence of a queueing problem in the window, but n=9 |
| `GEMINI_HEDGE_AFTER_MS` | Blocked on #1; **negative** with a single key |
| More Gemini keys, new Google projects | **The real lever, and the prerequisite for the hedge** |
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
