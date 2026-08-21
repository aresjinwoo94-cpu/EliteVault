# Analyzer latency — what's on the branch, and what only ops can fix

Companion to `perf/analyzer-latency`. Read the second section first: the
biggest levers on this pipeline are configuration, not code, and no amount of
code makes up for an exhausted ScreenshotOne quota or a single Gemini key.

---

## 1. Where the time actually goes

Measured against the code as of this branch, largest first:

| Cost | Typical | Owner |
|---|---|---|
| Screenshot capture when ScreenshotOne is exhausted (thum.io → Microlink → mshots) | up to ~45s | **ops** (O-1) |
| The vision call (`run-analyzer-agent`) — the longest step | ~15-40s | model + image height |
| Gemini rate-limit cooldowns (15 RPM per key, ~65s cooldown) | 0s or 65s | **ops** (O-2) |
| Inngest orchestration round-trips (each step is a separate invocation) | ~300ms each | code (WP-4) |
| Discovery fetch + parse (10s cap) | 0-10s | code (WP-1) — runs parallel to the capture, so it only bites when it's the slower of the two |

## 2. Ops prerequisites — status at the time of this branch

Checked against `.env.local` and the code. **None of these are things the code
can do**, and together they outweigh everything in section 3.

| # | Action | Status found | Impact |
|---|---|---|---|
| O-1 | Fund ScreenshotOne (or set `MICROLINK_API_KEY`) | `SCREENSHOTONE_ACCESS_KEY` is set; **remaining quota unknown from here**. `MICROLINK_API_KEY` is **not set**. | **High** |
| O-2 | Add `GEMINI_API_KEY_2..10` from separate Google projects | **Not done — one key only.** The pool in `ai/providers/gemini.ts` is already implemented and idle. | **High**, free |
| O-3 | Raise `ANALYZER_CONCURRENCY` as the key pool grows | Unset → default 5 | Medium |
| O-4 | Move to Vercel Pro (`maxDuration` 300s vs 60s) | **Not done** — `app/api/inngest/route.ts` is pinned at `maxDuration = 60`, the Hobby maximum | **High, structural** |

**O-1 is settled: ScreenshotOne is not the problem and funding it buys nothing.**
Measured — 6 of 100 captures used in a month across 108 audits, and capture
costs 6–19s cold whichever provider serves it (§4a). The original brief's number
one hypothesis is dead. Check it yourself any time:

```bash
curl "https://api.screenshotone.com/usage?access_key=$SCREENSHOTONE_ACCESS_KEY"
```

**O-2 is VERIFIED DONE (2026-08-20): the three keys are three independent
projects.** Measured, not assumed — `scripts/gemini-pool-check.mts` saturated
one key until it rate-limited, then probed the others immediately; both answered
200, so neither shares the first one's quota. The pool is real, ~45 RPM.

Note this could not be answered by inspection: nothing in a key string reveals
its project, and Vercel marks these values **Sensitive**, which makes them
write-only — neither the dashboard nor `vercel env pull` will return them. The
keys have to come from AI Studio, where they were created. To re-check later:

```bash
ENV_FILE=<file with the keys> npx tsx --tsconfig scripts/tests/tsconfig.json scripts/gemini-pool-check.mts
```

**And more keys are not the remaining lever.** Run C in §4b was taken with this
real 3-project pool and still saw 8.5s → 50s+ on identical input, plus a Google
`503`. The residual variance is the provider's, not the quota's.

O-2 is free and takes minutes: create additional Google Cloud projects, mint a
Gemini key in each, and set them as `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, …
The provider already rotates them; multiple keys from the SAME project share
one quota and do nothing.

## 3. What the code on this branch does

| WP | Change | Effect | Reversible by |
|---|---|---|---|
| WP-3 | Show the captured screenshot + scraped signals while the audit runs | **Perceived** wait drops from ~30-50s of spinner to ~5-15s to first real content. No wall-clock change. | Revert commit, or roll back migration 0030 |
| WP-1 | Cache the discovery payload by URL hash | Removes a 10s-capped fetch+parse on re-audits | `DISCOVERY_CACHE_TTL_MINUTES=0` (no deploy) |
| WP-2 | Stop calling ScreenshotOne while its quota is known-exhausted | ~4s/audit back in the exhausted-quota state | `SCREENSHOTONE_EXHAUSTED_COOLDOWN_MINUTES=0` (no deploy) |
| WP-4 | Two flag/id-gated steps no longer run as no-ops | Frees the concurrency slot sooner; no change to this user's wall clock | Revert commit |

No feature was removed. No flag default was changed. No AI call was added —
WP-3 in particular does **not** use `ANALYZER_QUICK_SCORE`, which is off on
purpose because it costs a second vision call per audit.

### Migrations to apply

```bash
npm run db:migrate -- supabase/migrations/0030_analysis_discovery_signals.sql
```

```bash
npm run db:migrate -- supabase/migrations/0031_discovery_cache.sql
```

Both are additive and idempotent, and both are **fail-open**: the pollers retry
without the new column, and the discovery cache returns null if its table is
missing. So the order of deploy vs migrate doesn't matter — but until they're
applied, WP-3 shows only the screenshot (no signal chips) and WP-1 does nothing.

Rollbacks live in `supabase/rollbacks/0030_*_rollback.sql` and `0031_*_rollback.sql`.

## 4. WP-5 — env tuning that is CONDITIONAL on Vercel Pro

> **Do not apply any of this while the project is on Vercel Hobby.**
> The budgets below assume `maxDuration = 300`. On Hobby the platform kills the
> step at 60s and Inngest sees an opaque `HTTP 504`, which loses the work and
> **refunds the audit**. Raising a budget without raising the ceiling above it
> converts a slow audit into a failed one.

Nothing here is a code default. Every current default is calibrated to the 60s
Hobby ceiling and is deliberately left alone on this branch.

Once O-4 is done, in this order:

1. **Raise the ceiling first.** `app/api/inngest/route.ts` → `export const maxDuration = 300;`
   This is the only code edit in WP-5, and it must land and deploy *before* any
   env change below.
2. **Then the step budget.** `ANALYZER_STEP_BUDGET_MS=250000` (default 50000).
   Keep it ~50s under `maxDuration`: the headroom covers the upload and DB
   writes a step does around its bounded call. See `lib/deadline.ts`.
3. **Then the capture budget.** `SCREENSHOT_BUDGET_MS=120000` (default 45000).
   Must stay well under `ANALYZER_STEP_BUDGET_MS` — `capture-screenshot`
   already reserves 12s for the upload that follows inside the same step.
4. **Only then, image size.** `SCREENSHOT_FULL_PAGE_MAX_HEIGHT` (default 4500).
   Raise in steps of ~1500 and measure. Height is what the vision call is both
   billed and *timed* on, so this is the knob most likely to give the time back.
5. **`maxTokens` in the analyzer agent is capped at 8192 for TIME, not tokens.**
   Revisit it only after 1-4 are stable, and only with before/after numbers.

Reversing is symmetrical: lower the env values first, then `maxDuration`.

## 4a. Where the 60s actually goes — measured

`maxDuration = 60` is a **fixed constraint**, not a dial. There is no Vercel Pro
and there won't be, so anything that needs more than 60s per step is a design
problem to solve inside the limit.

### Production reality, 30 days, from the `analyses` table

| status | n | mean | p50 | p95 | max |
|---|---|---|---|---|---|
| succeeded | 51 | 98.3s | **79.5s** | 211.5s | 436s |
| refunded | 57 | 231.8s | 207.2s | 406.9s | 534.9s |

Success rate **47%**. The target was ~30s; the median *successful* audit is 79.5s.

### How many audits fit in one step budget

| total time | means | n | share |
|---|---|---|---|
| ≤50s | one step | 17 | 32% |
| 50–110s | ≥2 steps | 20 | 38% |
| >110s | ≥3 steps, i.e. retries | 16 | 30% |

**68% of the audits that succeed exceed a single step budget.** Since each
Inngest step gets its own 50s, that means most successful audits are already
paying for at least one retry. That is the shape of the problem: not one slow
step, but a step that fails and is re-run.

### Capture is NOT the bottleneck — measured, n=5 per store, cold

`scripts/measure-capture-latency.mts`, cache-busted so no provider can serve a
stored copy (the state a real audit of a new URL is in):

| reference store | mean | p95 | served by |
|---|---|---|---|
| Shopify normal (allbirds) | 10.7s | 11.0s | ScreenshotOne |
| anti-bot (aesop, Cloudflare) | 6.2s | 6.6s | thum.io |
| very tall PDP (brilliantearth) | 12.7s | 15.7s | thum.io |
| fast / light (vitalliving) | 14.0s | 18.8s | ScreenshotOne |
| heavy DTC (gymshark) | 12.8s | 15.2s | ScreenshotOne |

**6–19s across every category, with no pathological tail.** Against a 79.5s
median that leaves ~60s to the vision call and orchestration. Discovery runs in
parallel with capture and is capped at 10s, so it costs nothing on this path.

Two things worth knowing from the same run:
- Repeats of the same URL cost **0** ScreenshotOne quota and return in ~0.2s —
  their 24h cache works. Real audits are new URLs, so the cold column is the
  one the product pays.
- ScreenshotOne **refused 2 of the 5** (Cloudflare, and `host_returned_error`
  on brilliantearth). Those fell through to thum.io and were still fast.

## 4b. WP-C — NOT COMPLETE, and what the measurement does and doesn't show

**Status: WP-C's acceptance criteria are not met.** No adaptive budget was
built. This section records what was measured, what it supports, and — more
importantly — what it does not, because an earlier draft of it overclaimed.

```bash
npx tsx --tsconfig scripts/tests/tsconfig.json scripts/measure-analyzer-latency.mts
```

### What the harness measures

The vision call only. It feeds a **stored screenshot** straight into
`runAnalyzerAgent` under `STEP_BUDGET_MS` — the real 50s production budget,
which matters because every earlier measurement in this repo used a generous
deadline and so hid the only failure mode that counts: at 50s an 88s audit
doesn't run slowly, it **refunds**.

### What it does NOT measure — and why that matters

**It never runs the capture pipeline.** WP-C's two proposed levers are both
capture-side: the provider `delay`/wait, and `SCREENSHOT_FULL_PAGE_MAX_HEIGHT`.
A benchmark that starts from an already-captured image cannot say anything about
either. An earlier version of this section concluded "the brief's WP-C premise
doesn't hold" from exactly that benchmark. **That conclusion was not supported,
and it contradicted section 1 of this same document**, which lists capture as
the largest single cost and calls image height "the knob most likely to give the
time back". Those two claims were never reconciled because the second one was
wrong to make.

### The numbers, with their caveat stated first

Two independent runs of the same harness disagree:

| ceiling | run A | run B |
|---|---|---|
| 8192 (default) | 1/3 completed, avg 38.8s | 2/3 completed, avg 27.6s |
| 16384 | 1/3 completed, avg 44.3s | 2/3 completed, avg 31.9s |

Different fixtures completed in each. In run B, **all six calls hit `429` on the
primary model and were served by fallback models** — so that run timed the
degraded chain, not the path production normally takes. Run A very likely did
too. `scripts/verify-capture-blocked.mts` and this harness both use whatever key
`.env.local` holds, and a local key is not the production pool.

What survives from this honestly:

- **Higher is not better** for the output-token ceiling: no arm completed more
  audits than the other. `ANALYZER_MAX_TOKENS` exists so the experiment can be
  re-run on real traffic without a deploy; **the default is unchanged at 8192**.
- **A local run tells you nothing about production's key pool.** Read the
  production env, never `.env.local`, before drawing a conclusion about quota.

### Criterion 1 — the measurement is complete; the TARGET is not met

All four missing pieces are now done:

1. ~~Capture-side benchmark~~ — §4a. n=5 per store, cold, all five categories.
2. ~~Real `finished_at − started_at` from `analyses`~~ — §4a. 30 days, n=108.
3. ~~Repeats per cell~~ — n=5 capture, n=5 vision, interleaved and paced.
4. ~~A measurement against the real key pool~~ — run C below, 3 independent
   projects (verified by `scripts/gemini-pool-check.mts`).

**And the target is still not met, for a reason the measurement now explains
rather than guesses at.** The brief wanted normal and fast stores near ~30s by
adapting capture wait and image height to page weight. Measurement says:

- capture is 6–19s cold for every category, so there is no capture time to win;
- image height has no measurable effect on vision time (three runs, three
  different winners);
- the vision call varies 8.5s → past 50s **on identical input with a healthy
  key pool**, which is Google-side queueing, not anything we feed it.

There is no page property that predicts the wait, so there is nothing to adapt
the budget *to*. WP-C's proposed mechanism does not exist. Saying "criterion 1
met" would require inventing a number; it isn't, and this is why.

### Image height is NOT the lever — measured three times, against the real pool

This document asserted for a long time that "height is what the vision call is
both billed and timed on", and WP-C proposed tuning it. It was never measured.
`scripts/measure-image-height.mts` measures it: the same page captured at
several heights, then the same vision call repeated on each — arms
**interleaved** so both sit in the same part of the provider's load curve, and
paced so a key can recover between calls.

| run | pool | n | 4500px (521KB) | 3500px (427KB) | 2500px (285KB) |
|---|---|---|---|---|---|
| A | 1 key | 4 | 44.4s, 3 failed | — | **15.2s, 0 failed** |
| B | 1 key | 3 | **17.7s, 0 failed** | 33.9s, 1 failed | 36.1s, 2 failed |
| C | **3 keys** | 5 | 29.6s, 2 failed | **16.9s, 0 failed** | 38.6s, 2 failed |

**Every run crowns a different winner, including the run with a real 3-project
pool.** In run C the *smallest* image was the *slowest* — which cannot be true
if height drove the time.

The variance on identical input is the finding. Run C's 4500px arm, same bytes
five times: `50.0, 25.8, 50.0, 8.5, 13.6`. **8.5s to past 50s on one image**,
with a healthy pool, and one run failed with an explicit Google `503`.

So the noise is **provider-side** — model queueing and overload on Google's end
— not quota and not page weight. More keys don't damp it (run C proves that),
and neither would a shorter image.

**Nothing about image height was changed.** Lowering the cap would cost report
coverage and buy nothing measurable.

Until those exist, **no budget should be changed**, and none was: `lib/deadline.ts`,
`lib/screenshot-core.ts`, `app/api/inngest/route.ts` and `lib/flags.ts` have zero
diff. The brief's own rule stands — *an audit that takes 40s and works beats one
that aims for 30s and 504s* — but "we didn't measure it properly yet" is the
honest reason here, not "we measured it and the premise was wrong".

### One sub-item worth retiring rather than building

The brief suggests lowering `SCREENSHOT_FULL_PAGE_MAX_HEIGHT` per audit "when
the page is detectably short". That saves nothing: the setting is a **cap**, so
a page already shorter than it is unaffected. The version that would save real
time is lowering the cap on TALL pages, which is a content tradeoff the brief's
own red line forbids. Worth deciding deliberately rather than leaving as an
open suggestion.

## 5. How to verify a latency change

Numbers or it didn't happen. Per audit, `finished_at - started_at` on the
`analyses` row is the wall clock; the poll at which `screenshot_url` first
appears is the perceived one.

Use a fixed set of ~5 stores so runs are comparable: a plain Shopify store, a
Cloudflare/anti-bot store, a very tall page, a fast one, and one you know is a
screenshot-cache hit. Run each twice (cold, then warm) and compare like with
like — a warm run measures the caches, a cold one measures the providers.

Also confirm, on every change:

- **No extra AI calls**: count rows in `usage_events` per audit. Must be equal
  or lower.
- **No flag drift**: every default in `lib/flags.ts` unchanged, and
  `ANALYZER_EXTRA_SHOTS` still 0.
- **No feature loss**: score, screenshot, annotations, top fixes, persona,
  scenarios, ad-readiness, Growth Map, meta-ads (Scale), community, and
  niche-winners when its flag is on.
