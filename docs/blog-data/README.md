# docs/blog-data: reproducible data behind blog figures

Every number a blog post states about EliteVault's own data comes from here, with the query that produced it. **Rule:** a statistic is only publishable with **n ≥ 30**, always quoted with its sample ("n = X stores, from [date] to [date]"). No PII: no URLs, emails, user ids or store names. Everything is read-only (`scripts/blog/_supa.mjs` can only GET).

Run from the repo root (needs `.env.local` with the Supabase URL and service role key, which is never committed):

| File | What it is | Re-run |
|---|---|---|
| `a2-aggregates.mjs` → `a2-aggregates.json` | Aggregates over completed audits: ad-readiness verdict shares, category scores, weakest category, issue themes, annotations, modeled 7-day ROAS band, per-niche cuts (only if n ≥ 30) | `node docs/blog-data/a2-aggregates.mjs` |
| `example-loss-projection.mjs` → `.json` | One real Simulator run that projected a loss in all three scenarios (sanitized: no URL or id) | `node docs/blog-data/example-loss-projection.mjs` |
| `a4-search-console.json` (+ `gsc-2026-10-22/`) | Blog ranking from the owner's Search Console export (public data of our own site) | `node scripts/blog/gsc-ranking.mjs` |
| `a4-traffic-ranking.json` | First-party `page_views` ranking, kept only as a cross-check (thin) | `node scripts/blog/traffic-ranking.mjs` |
| `../blog-youtube-videos.json` | The 8 videos of the channel | `node scripts/blog/youtube-inventory.mjs` |

## A2 method (so the figures can be audited)
- **Unit:** one store domain, its most recent succeeded audit. A store audited ten times counts once.
- **Excluded:** audits from the team's own account (tests) and audits whose capture was blocked by an anti-bot screen (their score describes the interstitial, not the store).
- **Sample (2026-10-22):** 498 succeeded audits read → **n = 134 distinct stores**, audits from 2026-06-02 to 2026-10-22. Composition (declared in the JSON): about half are anonymous pre-login audits (51.5%), the largest single account is 11.9%, 10 domains look like tests, and a store counts once however often it was audited. It is **self-selected** (owners or visitors who chose to audit a store, often because they suspect a problem). Never say "Shopify stores on average".
- **Excluded:** audits from team accounts (`BLOG_EXCLUDE_EMAILS` in `.env.local`, not committed; the JSON records how many), 44 audits with a blocked capture, and 9 degenerate audits (score 0 or every category 0), which would otherwise drag the means down and tilt the weakest-category count.
- **Issue themes** are a word-boundary keyword match over the model-written fix `title` and `why`; they measure what the audit flagged, not an independent inspection. There is no "% of stores without visible shipping info" statistic: `shipping_returns_policies` counts audits whose fixes *mention* shipping/returns, not stores lacking it.
- **`weakest_category`:** the model scores the CRO category lowest in most audits, so read it as a property of the audit rubric.
- **`modeled_roas_7d`** uses `lib/meta/roas-range.ts` (score 0–100 + the audit's detected niche; `roas-model.mjs` is a copy kept in sync by `scripts/tests/blog-data-sync.test.ts`): a modeled range, never a campaign result, and not identical to the panel the product shows, which classifies the domain's first label.
- **Per niche:** every niche is below 30 stores today (largest: apparel 21, home 19, accessories 19), so no per-niche statistic is publishable yet. Re-run later.
- **Simulator runs:** only 11 simulations from one account exist (8 succeeded), so there is **no aggregate** for scenario ROAS. Only the single stored example may be quoted, as an example.

## A4: blog ranking (Search Console, last 3 months, exported 2026-10-22)

Source: the owner's Search Console export (`gsc-2026-10-22/`, processed by `scripts/blog/gsc-ranking.mjs` into `a4-search-console.json`). It replaces the thin first-party ranking used in the first draft of this PR (`a4-traffic-ranking.json`, 452 rows, kept only as a cross-check).

**What the data says (read this before choosing posts):**
- The site had **8,318 clicks and 20,608 impressions**, and **88.2% of the clicks come from brand queries** ("elite vault" and about 40 misspellings, plus "apk", "fc mobile", "game"). Most of that traffic is from India, Brazil, Bangladesh and South Africa. A good part of it is probably people looking for something else called Elite Vault, not store owners. Do not read it as audience for the blog.
- The **blog got 3 clicks in 3 months (0.04% of the site)** and 1,596 impressions across 21 posts. Most impressions sit at average positions 50–85, i.e. pages 5–9 of Google. The few posts on page 1 (positions 5–8) are `ecommerce-store-audit-vs-consultant`, `ecommerce-design-trends-2026`, `why-customers-abandon-cart-2026` and `best-shopify-tools-increase-roas-2026`, but with 24–69 impressions.
- **The one non-brand query with real clicks is "meta ads simulator"** (42 clicks, position 2.4; with "meta ad simulator" and "meta ads simulator online" about 57 clicks), landing on `/meta-ads-forecast` (115 clicks, CTR 16%). Everything else non-brand sits at positions 60–90 ("webshop audit" 197 impressions; "shopify conversion rate" 74; the "how to increase / improve / good conversion rate" family ~400 impressions together).
- None of the three new keywords has clicks yet: "how to increase roas" and "how to boost ecommerce sales with generative AI" do not appear; "redesign" does not appear. "what is a good roas for ecommerce in 2026" (1 impression, position 9) and "ecommerce roas tracking tool" (8 impressions, position 6.5) are the closest.

| Slug | Impressions | Clicks | Avg position | Intent | Best-fit EliteVault feature |
|---|---|---|---|---|---|
| good-conversion-rate-for-shopify | 551 | 0 | 70.34 | informational | conversion bands (modeled); own aggregates |
| how-to-increase-shopify-conversion-rate | 327 | 1 | 80.84 | informational | ranked fixes; own aggregates (issue themes) |
| abandoned-cart-recovery | 158 | 1 | 54.81 | informational | `post_purchase` fix track |
| free-website-audit-tools | 107 | 1 | 50.48 | commercial | the Free audit; verdict |
| why-customers-abandon-cart-2026 | 69 | 0 | 7.49 | informational | modeled |
| shopify-cro-audit | 62 | 0 | 72.48 | commercial | full report |
| best-shopify-tools-increase-roas-2026 | 60 | 0 | 8.17 | commercial (tool list) | Simulator; modeled ROAS range |
| ecommerce-design-trends-2026 | 42 | 0 | 6.83 | informational | annotated design findings; Library |
| ai-ecommerce-statistics-revenue-impact | 39 | 0 | 13.18 | informational (numbers) | own aggregates; buyer persona |
| shopify-product-page | 36 | 0 | 24.08 | informational | annotated screenshot; `urgent` fixes |
| reverse-engineer-winning-shopify-stores | 33 | 0 | 13.15 | informational (process) | Library; competitor track |
| ecommerce-store-audit-vs-consultant | 24 | 0 | 5.58 | commercial | the Free audit; verdict |
| shopify-store-analyzer | 22 | 0 | 18.77 | commercial | annotated screenshot + verdict |
| is-your-store-ready-for-meta-ads | 17 | 0 | 19.94 | commercial | ad-readiness verdict |
| ecommerce-cro-specialist | 14 | 0 | 17.86 | commercial | ranked fixes; fix tracks |
| why-meta-ads-arent-converting | 12 | 0 | 12.83 | informational | modeled ROAS range; Simulator |
| store-analyzer-vs-shopify-analytics | 9 | 0 | 46.89 | informational | verdict vs reports |
| store-audit-review-my-store-feedback | 7 | 0 | 20 | informational | annotated screenshot |
| why-your-shopify-store-isnt-converting | 3 | 0 | 44.33 | informational | verdict + fixes |
| ai-shopify-designer | 2 | 0 | 1.5 | informational / commercial | annotated screenshot; persona |
| new-free-shopify-tools-2026 | 2 | 0 | 7 | informational | the Free audit |

Rank by **impressions and position**, not clicks (there are none). Positions below ~50 are a long way from a click; changes of a few impressions are noise.

### Phase C shortlist (recommendation, to be confirmed before PR-C)
Criteria: impressions, how close the post is to page 1, a real fit with a feature, and not having been rewritten already in batches 1 and 2 (those four-plus-four posts already follow the new format; they would only gain evidence blocks).
1. `good-conversion-rate-for-shopify`: the largest blog impression count (551) and a query family ("shopify conversion rate", "what is a good conversion rate…") of ~250 impressions; not yet rewritten. Evidence: conversion bands (modeled) and own aggregates.
2. `why-customers-abandon-cart-2026`: page-1 position (7.5), 69 impressions; improve on top of what exists. Evidence: modeled, `post_purchase` track.
3. `best-shopify-tools-increase-roas-2026`: position 8.2 and the ROAS/simulator topic that is the only non-brand query that converts. Evidence: Simulator and modeled ROAS range. Must be coordinated with the new `how-to-increase-roas` (cannibalization, PR-D).
4. `ecommerce-design-trends-2026`: position 6.8, 42 impressions. Evidence: annotated design findings; Library (anonymized).
5. `shopify-cro-audit`: 62 impressions, hub of the conversion cluster, ranks for "shopify cro audit" at position 74. Evidence: full report. (A post of the first-sale batch; its content is only extended, never rewritten.)
6. `ai-ecommerce-statistics-revenue-impact`: position 13, 39 impressions; the only numbers post. Evidence: own aggregates.
Skip for now: `how-to-increase-shopify-conversion-rate` (327 impressions at position ~81 but rewritten on 2026-10-19; the ranking has not caught up yet: re-check in 3–4 weeks), `abandoned-cart-recovery` and `free-website-audit-tools` (rewritten in the last two weeks).

The first-party `page_views` ranking and this one disagree a lot (the first-party data is dominated by a few visitors and by team traffic): trust Search Console.
