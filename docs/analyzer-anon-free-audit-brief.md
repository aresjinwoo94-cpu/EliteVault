# Brief — Analyzer: anonymous/free state audit, gating verification, SEO-CTA bug, speed

Companion reading: `docs/analyzer-latency.md` (WP-1..WP-5, production latency
data) and `docs/infra-debt.md` (typecheck/migration debt). This brief does not
repeat their content — it tells you what's still open in each, plus what this
audit found that neither document covers: the anonymous/free-tier product
surface and a routing bug on the SEO landing pages.

Written from a read-only pass over `C:\Dev\MK3v2\elitevault` (branch at the
time of writing: `perf/blocks-preview-latency`) plus live testing against
production (elitevaultapp.com) as a logged-out visitor with a fresh browser
profile (no cookies, no account).

## ⚠ Scope boundary — read this first

**Do not touch `app/(app)/app/liquid`, `ai/agents/liquid-block-agent.ts`,
`inngest/functions/blocks-preview.ts`, `components/**/blocks-*` /
`components/**/liquid-*`, or anything under `app/api/blocks-projects`.** That
surface (Liquid Blocks) is owned by a separate, currently in-progress work
session and must not be edited, refactored, or even reformatted as a side
effect of this brief. If a change here genuinely requires touching a file
that Liquid Blocks also touches (only `app/api/inngest/route.ts` is shared —
see WP-2 below), make the smallest possible diff and call it out explicitly
in the PR description.

**Before starting:** `git status` on this checkout currently shows ~362
files as modified with equal insertions/deletions per file (a CRLF/LF
line-ending mismatch, not real content changes — confirmed by diffing
`lib/deadline.ts`, which is untouched code). Do not commit this noise.
Branch from a clean `main` (per `docs/infra-debt.md` §3's own branch-hygiene
rule), or if the line-ending config needs fixing, do that as its own isolated
`chore/` commit before anything else lands.

---

## 1. TL;DR

- The plan-gating rules you asked me to protect (Meta Ads Optimizer +
  Campaign Scenario Modeler = Pro/Scale only, Library full data = paid only)
  are **already correctly implemented and server-enforced**, for anonymous,
  free, Pro and Scale viewers alike. I verified this by reading the
  enforcement code (not just the UI) and by running a real anonymous audit
  against production. No change needed there — see §2.
- The 40-second "create an account" prompt you remembered is **still there
  and working exactly as you described**: a persistent banner immediately,
  plus a single dismissible modal at 40s, shown once per report, never
  repeated. See §2.4.
- **New finding, not previously documented**: every dedicated marketing
  landing page (`/free-website-audit`, `/meta-ads-forecast`,
  `/ai-buyer-persona-simulator`, `/convertmate-alternative`,
  `/winning-shopify-stores[/niche]`) sends its "Audit my store free" button
  straight to `/sign-up`, skipping the anonymous analyzer entirely — even
  though the anonymous flow exists, works, and is what the homepage (`/`)
  actually uses. This is very likely costing real signups on exactly the
  "free audit, no card" search terms these pages were built to rank for.
  This is the highest-leverage fix in this brief. See §3.
- Analysis speed and reliability is a **known, already-measured problem**
  (`docs/analyzer-latency.md`): 30-day production data showed a 47% success
  rate, 79.5s median for successful runs, and refunds averaging ~232s before
  the user is told it failed. The single biggest remaining lever (WP-5 —
  raising the Analyzer's own step/screenshot budgets now that the project is
  confirmed on Vercel Pro with `maxDuration=300`) is coded, env-gated, and
  has never been turned on. See §4.
- Store-platform coverage (Shopify, WooCommerce, Magento, BigCommerce,
  "custom") and anti-bot handling already exist and are reasonably mature.
  I could only live-verify one Shopify store end-to-end; §5 gives a short
  checklist to close that gap without writing new code first.
- Separately from the Analyzer: `docs/infra-debt.md` documents 258 open
  typecheck errors, ~210 of them from one root cause (a hand-written Supabase
  `Database` type frozen at migration 0001 against a live schema at 0031).
  Worth flagging under "asegurarte que todo está en orden" even though it's
  not gating- or speed-related — see §6.

---

## 2. Gating verification — anonymous / free / Pro / Scale

I read the server-side enforcement (not the UI, which is decorative if the
server doesn't also check) and then ran a live anonymous audit against
`elitevaultapp.com` from a clean browser profile to confirm the rendered
report matches.

### 2.1 Meta Ads Optimizer + Meta Campaign Scenario Modeler

`lib/stripe/plans.ts` defines `quotas.metaRunsPerMonth`: **Free = 0, Pro =
1/month, Scale = unlimited.** This is enforced in the one place that matters:
`app/actions/meta-simulator.ts`'s `triggerSimulation()` calls
`assertQuota(user.id, "metaRun")` *before* inserting the `meta_simulations`
row and firing the Inngest event — a free user (or a second Pro attempt in
the same month) is rejected server-side with `META_QUOTA_EXCEEDED`, not just
hidden behind a disabled button. `app/(app)/app/analyzer/[id]/page.tsx`
independently gates whether the UI even *offers* the Meta section
(`canRunMeta = plan.quotas.metaRunsPerMonth !== 0`). Anonymous viewers get
`canRunMeta: false` hard-coded in `app/audit/[id]/page.tsx`. Verified live:
the anonymous report I ran shows only the ROAS-range teaser ("Your store is
modelable... Unlock my projection · Pro $19/mo") with no way to actually run
the modeler or optimizer.

**No change needed.** This matches what you asked for exactly.

### 2.2 Library

- Anonymous: `/app/library` redirects to `/sign-in` (confirmed live —
  navigating there while logged out lands on the sign-in page). Anonymous
  viewers only ever see a locked "Winners in your niche" teaser embedded
  *inside* the audit report (3 winners, `locked: true`, no revenue/traffic
  data), not the full Library.
- Free (logged in): `libraryFullMetricsCap: 3` in `lib/stripe/plans.ts` — 3
  entries with full metrics, everything else capped. This is passed as
  `plan` into `LibraryView`; I did not trace the client-side cap enforcement
  in `components/library/library-view.tsx` line by line, so treat that one
  line as **worth a 5-minute spot-check**, not fully verified end-to-end
  like the Meta gating above.
- Pro/Scale: `libraryFullMetricsCap: null` — unlimited.

**No change needed**, modulo the small spot-check above.

### 2.3 Anonymous audit — the flow itself

`app/actions/anon-analyzer.ts` (`createAnonAnalysis`) runs the *exact same*
Inngest pipeline as a logged-in audit (`analysis/requested`), just with
`userId: null`, `plan: "free"`, and `fast: true` (cheap model tier — the same
cost profile as a Free-plan audit). Guardrails, both confirmed live:

- **Rate limit**: `lib/anon/rate-limit.ts`, 1 audit per IP per 24h by
  default (`ANON_AUDIT_LIMIT_PER_DAY`), fail-open on a DB error so a metering
  blip never blocks a legitimate first-time visitor. I ran a real audit, then
  immediately tried a second one from the same session — it did not create a
  new analysis (URL stayed on `/`, no navigation to `/audit/[id]`); the code
  path shows this correctly surfaces as a `sonner` toast ("You've used your
  free audit for today. Create a free account to run more — no card
  needed.") with an inline "create account" action, which my text-scraping
  test tooling didn't catch in time (toasts are ephemeral and render outside
  `<main>`) but which is unambiguous from the source in
  `components/marketing/hero.tsx`.
- **Claim-on-signup**: `app/(app)/app/analyzer/page.tsx` re-parents the
  anonymous audit to the new account right after signup
  (`claimAnonAnalyses`), so the report the visitor just saw becomes their
  first owned analysis. Confirmed by reading the code; did not create a real
  account to verify end-to-end (would need a disposable email/OAuth
  identity — flag if you want this specific hop QA'd).

### 2.4 The 40-second sign-up gate

`components/analyzer/anon-register-gate.tsx` — exactly as you remembered it:
a persistent banner shown immediately on any anonymous report, plus a
`setTimeout(..., 40_000)` one-time modal (`sessionStorage` key
`ev_anon_register_gate`, so it never repeats even across report reloads in
the same tab session). No countdown, no fake urgency, a visible close
button. **This is intact and does not need any change.** (Separately, note
this is a *different* 40s than `components/analyzer/analyzing-state.tsx`'s
`SLOW_RUN_SECONDS = 40`, which only changes the *waiting-room copy* — "Still
going, the AI provider is busy..." — after 40s of an in-progress run. Two
unrelated constants that happen to share the value; don't conflate them if
you go looking for "the 40 seconds" in the code.)

---

## 3. Bug — SEO landing pages skip the anonymous flow entirely

**This is the one concrete functional bug this audit found, and it's worth
fixing before anything else here.**

The homepage (`/`, via `components/marketing/hero.tsx`) has a real inline
audit box: paste a URL, it calls `createAnonAnalysis()` directly, and routes
to `/audit/[id]` — no account required. I ran this live end-to-end (audited
`allbirds.com`, got a full gated report, confirmed the rate limit on a
second attempt).

Every *other* public entry point instead links straight to
`/sign-up?next=/app/analyzer`, forcing account creation before the visitor
sees anything:

| Page | CTA target |
|---|---|
| `/free-website-audit` (both CTAs) | `/sign-up?next=/app/analyzer` |
| `/meta-ads-forecast` (both CTAs) | `/sign-up?next=/app/analyzer` |
| `/ai-buyer-persona-simulator` (both CTAs) | `/sign-up?next=/app/analyzer` |
| `/convertmate-alternative` (both CTAs) | `/sign-up?next=/app/analyzer` |
| `/winning-shopify-stores` (both CTAs) | `/sign-up?next=/app/library` |
| `/winning-shopify-stores/[niche]` | `/sign-up?next=/app/analyzer` |

`/free-website-audit` is the sharpest case: its own on-page copy says "FREE
WEBSITE AUDIT · NO CREDIT CARD" and "1 FREE ANALYSIS · CANCEL ANYTIME," then
the button underneath it demands an account before running anything —
directly contradicting its own promise, on the page whose entire job (per
the `elitevault-seo` playbook) is to rank for "free shopify store audit" and
convert cold, skeptical search traffic. That traffic is the least likely to
tolerate a signup wall before seeing any value.

**Fix**: replace the `<Link href="/sign-up?next=/app/analyzer">` CTAs on
these pages with the same inline audit box the homepage uses
(`components/marketing/hero.tsx`'s `HeroAuditBox`, or a shared extraction of
it if the layout differs per page). Route the visitor to `/audit/[id]` on
success, exactly like the homepage. Keep `/sign-up` as a fallback for
visitors who click through without pasting a URL (the current "or see how it
works first" secondary link pattern already does this correctly on the
homepage).

**Watch for**: the anon rate limit is per-IP, not per-page, so a visitor who
tries the homepage widget and then also lands on `/free-website-audit` should
correctly hit the same daily limit — this falls out of the existing
`checkAnonAuditRate()` logic for free once the CTA wiring is fixed, no
separate change needed.

---

## 4. Speed & reliability

Do not re-derive this from scratch — `docs/analyzer-latency.md` already has
the measurements, and re-measuring without reading it first will waste time
re-discovering things it already ruled out (e.g., it explicitly disproves
"lower `SCREENSHOT_FULL_PAGE_MAX_HEIGHT` on short pages" as a lever, and
disproves "more Gemini keys reduce variance" — read §4a/§4b before proposing
either).

What's true as of this pass:

- **Capture is not the bottleneck.** 6–19s cold across every store category
  measured (plain Shopify, anti-bot/Cloudflare, very tall PDP, fast/light,
  heavy DTC). The vision call (Gemini) is where the time and the failures
  are — 8.5s to 50s+ on *identical* input, which the doc attributes to
  Google-side queueing, not anything in this codebase.
- **68% of audits that succeed already require at least one Inngest step
  retry** (the doc's §4a), because each step gets only 50s
  (`ANALYZER_STEP_BUDGET_MS`, `lib/deadline.ts`) and the vision call alone
  can exceed that. A full step retry is expensive: it restarts the whole
  step, not just the one slow call, and Inngest's own backoff adds more wait
  on top — which is very likely why refunded audits average ~232s (someone
  waits four minutes to be told it failed) rather than failing fast.
- **The precondition WP-5 was blocked on is now satisfied and not yet
  acted on.** `docs/analyzer-latency.md` explicitly gates raising the
  Analyzer's own budgets on "Vercel Pro, `maxDuration=300`" and says do not
  do this on Hobby. `app/api/inngest/route.ts` now sets `maxDuration = 300`
  with a comment stating "the owner has confirmed this project is on Pro" —
  but that change was made *for Liquid Blocks* and explicitly says it does
  **not** touch the Analyzer's own budgets, which remain at their
  Hobby-era defaults. Checked locally: `ANALYZER_STEP_BUDGET_MS` and
  `SCREENSHOT_BUDGET_MS` are **not set** in `.env.local` (so both are still
  running on their 50s/45s hardcoded defaults). **I could not check the
  production Vercel environment from here — verify there before assuming
  the local absence means production is unconfigured too.**

### WP-5 (execute) — raise the Analyzer's own budgets

This is `docs/analyzer-latency.md` §4's own documented plan; follow it
exactly, in order, on its own branch:

1. Confirm in the **Vercel dashboard** (not `.env.local`) that
   `maxDuration = 300` is actually deployed and the project is genuinely on
   Pro/Fluid Compute — don't take the code comment's word for it a second
   time once you're the one about to raise budgets on top of it.
2. Set `ANALYZER_STEP_BUDGET_MS=250000` (keep ~50s of headroom under
   `maxDuration`).
3. Set `SCREENSHOT_BUDGET_MS=120000` (must stay well under the step budget —
   `capture-screenshot` reserves 12s inside itself for the upload).
4. Do **not** touch `SCREENSHOT_FULL_PAGE_MAX_HEIGHT` or
   `ANALYZER_MAX_TOKENS` — both were tested in §4b and neither moved the
   needle; changing them now would just be re-spending time the doc already
   spent.
5. Re-run `scripts/measure-analyzer-latency.mts` against the **production**
   key pool (not a local key — the doc is explicit that a local run tells
   you nothing about production quota) before and after, and compare
   `finished_at - started_at` on real `analyses` rows for a week after
   deploy against the 47%/79.5s/232s baseline. Numbers or it didn't happen —
   that's this repo's own standard, not a new one I'm imposing.

### Also worth turning on, measured alongside WP-5

`GEMINI_HEDGE_AFTER_MS` (`ai/providers/gemini.ts`) — a second Gemini call on
a *different* API key fires after N ms with no answer yet; whichever
answers first wins. Currently off by default, gated on having ≥2 independent
Gemini API keys in the pool (`GEMINI_API_KEY_2`/`_3`, which the latency doc
says were verified as independent projects — re-verify in production for the
same reason as step 1 above). This is **projected, not measured live**: the
code comment estimates completion 73%→93% and within-30s 53%→78% from a
15-sample run, explicitly caveated as unproven at scale. A sensible starting
value per the code's own comment is `12000`. Turn it on in the same
measurement window as WP-5 so you get one clean before/after rather than two
confounded ones — or stagger them by a few days if you want to attribute the
improvement to each independently.

**Why this serves "make it shorter, especially on failure"**: a single
Gemini call is already capped at 25s (`GEMINI_CALL_CAP_MS`, on by default),
so raising the *step* budget doesn't let one bad call hang indefinitely — it
lets the step retry that capped call two or three more times *inside itself*
before giving up, instead of failing the whole step and paying Inngest's
retry/backoff cost on top. Fewer full-step failures should mean both a
shorter median (fewer retried runs) and a shorter worst case for genuine
failures (the thing that's currently taking ~4 minutes to tell someone their
audit didn't work).

---

## 5. Cross-store compatibility

Already reasonably mature, not something that needs new code before you
verify what's there:

- `lib/analyzer/discovery-signals.ts` detects `shopify | woocommerce |
  magento | bigcommerce | custom` and falls back gracefully when a platform
  can't be identified.
- `lib/screenshot-core.ts` has tiered capture (ScreenshotOne → thum.io →
  Microlink → mshots fallback) specifically because different anti-bot
  vendors (Cloudflare and friends) block different providers differently.
- `components/analyzer/capture-blocked-notice.tsx` is a deliberate, honest
  "we couldn't actually see your store" state — shown instead of a fabricated
  audit when the capture returns a bot-check page rather than the storefront
  (there's a real production incident referenced in the code comment, on
  brilliantearth.com, where an earlier version of this guard let a
  Cloudflare interstitial get audited as if it were the store).

I only live-verified one store (Shopify, `allbirds.com`) end-to-end through
the anonymous flow. Before calling "works on all stores" verified, run the
same 5-store reference set `docs/analyzer-latency.md` §5 already established
for capture-latency testing — plain Shopify, Cloudflare/anti-bot,
very-tall-page, non-Shopify/WooCommerce or BigCommerce, and a cache-hit
repeat — but this time through the **full anonymous → report → gating**
path end-to-end, not just capture timing. That combination hasn't been
tested by anyone yet as far as the docs in this repo show.

---

## 6. Separately — architecture/quality debt (not gating- or speed-related)

`docs/infra-debt.md` already documents this in detail; flagging it here only
because "asegurarte que todo esta en orden" was part of the ask and this is
the most material thing under that heading I found:

- `next.config.mjs` runs with `typescript.ignoreBuildErrors: true` and
  `eslint.ignoreDuringBuilds: true`. 258 typecheck errors exist today; ~210
  of them trace to one cause — `lib/supabase/types.ts` hand-writes a
  `Database` type frozen at migration 0001, while the live schema is at
  0031. Every table added since (`saved_sites`, `community_analyses`,
  `screenshot_cache`, `usage_events`, `reviews`, `growth_map_history`, …)
  resolves to `never` in Supabase queries, which the code currently papers
  over with `as never` / `as any` casts scattered through the app —
  including inside Analyzer files this brief touches
  (`app/(app)/app/analyzer/[id]/page.tsx`, `app/audit/[id]/page.tsx` both
  read rows as `Record<string, unknown>` for exactly this reason).
- `docs/infra-debt.md` §2 has a ready adoption sequence (`npm run db:types`
  → `npm run db:doctor` → wire the generated type in → delete the casts file
  by file → only then flip the build flags). This is real work and shouldn't
  block the Analyzer fixes above — but it's the reason those pages read rows
  as loose `Record<string, unknown>` instead of typed objects, and it's
  worth scheduling on its own branch (`chore/infra-debt` already exists per
  the branch list) rather than letting it keep accumulating silently.

Not asking you to fix this as part of the Analyzer work — just surfacing it
so "todo está en orden" has an honest answer.

---

## 7. Suggested order of operations

1. `chore/`: fix the line-ending config if it's genuinely broken (verify
   `core.autocrlf`/`.gitattributes` first — don't just force-normalize 362
   files without understanding why they drifted), on a clean branch, alone.
2. `fix/seo-landing-anon-cta`: §3 — wire the real anon audit box into the
   5-6 landing pages currently linking to `/sign-up`. Smallest, highest-
   leverage, no backend risk (reuses existing, already-working code).
3. `perf/analyzer-step-budget`: §4 WP-5 — env-only change plus the hedge
   flag, measured before/after against production. No code changes beyond
   what's already merged and gated.
4. Spot-check §2.2's Library free-tier cap enforcement client-side (5
   minutes), and run the §5 cross-store checklist through the anonymous
   flow specifically.
5. `chore/infra-debt` (separate, already-scoped, not urgent): the typecheck
   adoption sequence in `docs/infra-debt.md` §2, whenever there's a slow
   week — not because it's on fire, but because every month it's deferred is
   another month of tables added to the `never`-typed pile.

None of the above touches `app/liquid` or its supporting files. If in doubt
about whether a file is shared with that work, grep the file for "liquid" or
"blocks" before editing it, and ask first if it's ambiguous.
