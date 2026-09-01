# §5 cross-store checklist — the anonymous flow, run end to end against production

Closes §5 of `docs/analyzer-anon-free-audit-brief.md`, which asked for the
5-store reference set to be run through the **full anonymous → report →
gating** path rather than capture timing alone. The brief noted that
combination "hasn't been tested by anyone yet as far as the docs in this repo
show". It has now.

Companion docs: `docs/anon-cta-seo-landings.md` (WP-1, the fix these CTAs
now carry), `docs/analyzer-latency.md` (§4a, the capture-only baseline this
compares against).

Run on **2026-09-01, ~02:20–02:40 UTC**, against **production**
(`elitevaultapp.com`) at `main` @ `ebfe4bf` — i.e. with the WP-1 fix live —
as a logged-out visitor. The owner temporarily raised
`ANON_AUDIT_LIMIT_PER_DAY` to 10 for this run and reset it to 1 afterwards.

## 1. Results

Every audit was started **from a different SEO landing's new audit box**, so
this doubles as end-to-end proof that the WP-1 CTAs work in production, not
just that the pipeline does.

| # | reference category | store | started from | status | wall | score | capture blocked |
|---|---|---|---|---|---|---|---|
| 1 | Shopify normal | allbirds.com | `/free-website-audit` | succeeded | 49.1s | 77 | no |
| 2 | anti-bot (Cloudflare) | aesop.com | `/meta-ads-forecast` | succeeded | 63.1s | 50 | **YES** |
| 3 | very tall PDP | brilliantearth.com | `/ai-buyer-persona-simulator` | succeeded | **168.4s** | 34 | no |
| 4 | fast / light | vitallivingstore.com | `/convertmate-alternative` | succeeded | 53.4s | 58 | no |
| 5 | heavy DTC | gymshark.com | `/winning-shopify-stores/apparel` | succeeded | 49.0s | 91 | no |

Wall time is `finished_at - created_at` read from the `analyses` rows, not
stopwatch timing in the browser.

**5/5 succeeded, 0 refunded.** Median wall 53.4s, mean 76.6s. For context,
`docs/analyzer-latency.md` §4a's 30-day production baseline was a **47%**
success rate with a 79.5s median for the ones that succeeded. n=5 is far too
small to claim the success rate improved — but it does mean every store
category in the reference set completes on the current configuration, which
is what §5 actually asked.

## 2. The anti-bot case is the one that matters, and it behaved correctly

aesop.com is the reason `components/analyzer/capture-blocked-notice.tsx`
exists. The run flagged it:

```
capture_blocked: { detected: true,
                   reason: "Cloudflare 'Performing security verification' screen" }
```

and — the important part — produced **`top_fixes: 0`, `annotations: 0`**. It
did not invent findings about a page it never saw. The report renders the
honest state instead of a fabricated audit:

> **We couldn't see your real store**
> aesop.com is protected by Cloudflare, so all we captured was the
> verification screen — not your storefront. Nothing below would describe your
> actual store, so we're not guessing.

with two actionable next steps (retry; allowlist screenshot tools). This is
the guard the code comment ties to the historical brilliantearth incident,
working end to end in production.

Note the score still renders as 50 on a blocked capture. It is not surfaced as
a store verdict — the notice replaces the findings — but a neutral 50 on a
page we admit we never saw is worth a second look if that value ever leaks
into a summary, an email or the `analyses` history list.

## 3. Gating on the anonymous report — verified on two stores

Checked on the rendered production reports for allbirds (#1) and gymshark (#5):

| gate | expected (brief §2) | observed |
|---|---|---|
| Annotated screenshot | shown | shown |
| Register gate banner | shown immediately | shown — "Create a free account to save it, run another and browse the winning-stores Library" |
| Meta ROAS teaser | teaser only | present |
| Meta modeler / optimizer controls | **absent** for anon | absent |
| Winners in your niche | 3, locked, no revenue/traffic | locked — "Unlock all 3 winners in your niche · Go Pro", "Real stores, live Meta ad counts and estimated revenue — on Pro" |

The only `$` figures on an anonymous report are the audited store's own
revenue-band ladder, the `$19/mo` upsell prices, and one inside a fix's prose.
No winner revenue or traffic is exposed. §2.1 and §2.2 hold in production for
anonymous viewers.

## 4. Two findings worth acting on

**brilliantearth took 168.4s — 3× the median of this run.** It is the tall-PDP
case, and at 141.5s of run time it necessarily crossed the 50s
`ANALYZER_STEP_BUDGET_MS` more than once, i.e. it is exactly the
retry-driven shape `docs/analyzer-latency.md` §4a describes. It also returned
the thinnest output of the five (score 34, 1 top fix, 2 annotations) despite
taking the longest. This is the single best argument for WP-5 — and WP-5 is
still blocked (see below).

**Hydration gap on the new boxes.** The submit button renders enabled before
React hydrates, so a click in that window is silently a no-op — no toast, no
navigation, nothing. This bit the first attempt of this very run. It is not a
regression (the homepage hero has always behaved this way), but it matters
more on SEO landings, where visitors arrive cold and click immediately. Worth
a follow-up: disable the button until hydrated, or wrap the box in a `<form>`
so the browser's native submit works pre-hydration.

## 5. What this still does NOT cover

- **The signed-in path is not verified.** The WP-1 session guard
  (`createAnonAnalysis` → `/app/analyzer?url=…`) needs a real account; the
  owner is doing that click-through separately.
- **Non-Shopify platforms are not represented.** The brief's §5 asked for
  "non-Shopify / WooCommerce or BigCommerce" as one of the five, but the
  reference set inherited from `docs/analyzer-latency.md` §4a does not
  actually contain one — all five are Shopify or Shopify-like. So
  `lib/analyzer/discovery-signals.ts`'s `woocommerce | magento | bigcommerce`
  branches remain untested end to end. Closing that needs a reference store
  added to the set first.
- **The cache-hit repeat case was not run separately.** allbirds had been
  audited ~7h earlier by the brief's own live test, and still took 49.1s, so
  no analysis-level reuse was observable at that interval.
- **n=5 says nothing about the success rate.** Do not read "5/5" as a fix to
  the 47% baseline.

## 6. Cost / data note

Preview and Production share the same Supabase project, and this run wrote
**5 real rows** into the production `analyses` table with real Gemini and
ScreenshotOne spend. `ANON_AUDIT_LIMIT_PER_DAY` was raised to 10 only for the
duration and reset to 1 afterwards.
