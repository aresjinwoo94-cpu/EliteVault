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

**Check ScreenshotOne's remaining quota:**

```bash
curl "https://api.screenshotone.com/usage?access_key=$SCREENSHOTONE_ACCESS_KEY"
```

If it's spent, that is the number one finding: every audit is on the slow
fallback chain, and WP-2 below only stops us from paying to be told so.

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
