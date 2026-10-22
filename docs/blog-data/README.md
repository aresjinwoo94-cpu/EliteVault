# docs/blog-data: reproducible data behind blog figures

Every number a blog post states about EliteVault's own data comes from here, with the query that produced it. **Rule:** a statistic is only publishable with **n ≥ 30**, always quoted with its sample ("n = X stores, from [date] to [date]"). No PII: no URLs, emails, user ids or store names. Everything is read-only (`scripts/blog/_supa.mjs` can only GET).

Run from the repo root (needs `.env.local` with the Supabase URL and service role key, which is never committed):

| File | What it is | Re-run |
|---|---|---|
| `a2-aggregates.mjs` → `a2-aggregates.json` | Aggregates over completed audits: ad-readiness verdict shares, category scores, weakest category, issue themes, annotations, modeled 7-day ROAS band, per-niche cuts (only if n ≥ 30) | `node docs/blog-data/a2-aggregates.mjs` |
| `example-loss-projection.mjs` → `.json` | One real Simulator run that projected a loss in all three scenarios (sanitized: no URL or id) | `node docs/blog-data/example-loss-projection.mjs` |
| `a4-traffic-ranking.json` | Blog traffic ranking from first-party analytics (provisional) | `node scripts/blog/traffic-ranking.mjs` |
| `../blog-youtube-videos.json` | The 8 videos of the channel | `node scripts/blog/youtube-inventory.mjs` |

## A2 method (so the figures can be audited)
- **Unit:** one store domain, its most recent succeeded audit. A store audited ten times counts once.
- **Excluded:** audits from the team's own account (tests) and audits whose capture was blocked by an anti-bot screen (their score describes the interstitial, not the store).
- **Sample (2026-10-22):** 496 succeeded audits read → **n = 140 distinct stores**, audits from 2026-06-02 to 2026-10-22. It is **self-selected** (owners who chose to audit their own store). Never say "Shopify stores on average".
- **Issue themes** are a keyword match over the model-written fix titles; they measure what the audit flagged, not an independent inspection.
- **`weakest_category`:** the model scores the CRO category lowest in most audits, so read it as a property of the audit rubric.
- **`modeled_roas_7d`** uses `lib/meta/roas-range.ts` (score + niche): a modeled range, never a campaign result.
- **Per niche:** every niche is below 30 stores today (largest: apparel 25, home 19, accessories 19), so no per-niche statistic is publishable yet. Re-run later.
- **Simulator runs:** only 11 simulations from one account exist (8 succeeded), so there is **no aggregate** for scenario ROAS. Only the single stored example may be quoted, as an example.

## A4: traffic ranking (provisional)
PostHog, Vercel Analytics and Search Console are not reachable from the dev machine. The only source is first-party `page_views` (`/api/track`), last 90 days, 452 blog rows. It is thin: the busiest post has 11 unique visitors. **Phase C must use the owner's Search Console export** (Performance → Pages, last 3 months).

| Slug | Unique visitors (90 d) | Views | Intent | Best-fit EliteVault feature |
|---|---|---|---|---|
| ai-ecommerce-statistics-revenue-impact | 11 | 39 | informational (numbers) | own aggregates; buyer persona |
| shopify-store-analyzer | 7 | 215 | commercial | annotated screenshot + verdict |
| best-shopify-tools-increase-roas-2026 | 5 | 6 | commercial (tool list) | Simulator + modeled ROAS range |
| ai-shopify-designer | 4 | 4 | informational / commercial | annotated screenshot, persona |
| free-website-audit-tools | 3 | 56 | commercial | verdict; the Free audit |
| store-analyzer-vs-shopify-analytics | 3 | 9 | informational | verdict vs reports |
| why-meta-ads-arent-converting | 3 | 3 | informational | modeled ROAS range; Simulator |
| shopify-landing-page-specialist | 2 | 3 | commercial | annotated screenshot |
| abandoned-cart-recovery | 2 | 2 | informational | `post_purchase` fix track |
| ecommerce-store-audit-vs-consultant | 2 | 2 | commercial | the Free audit; verdict |
| good-conversion-rate-for-shopify | 2 | 2 | informational | conversion bands (modeled); own aggregates |
| ecommerce-design-trends-2026 | 2 | 2 | informational | annotated design findings |
| ecommerce-cro-specialist | 2 | 2 | commercial | ranked fixes; fix tracks |
| reverse-engineer-winning-shopify-stores | 1 | 4 | informational (process) | Library; competitor track |
| how-to-increase-shopify-conversion-rate | 1 | 4 | informational | ranked fixes + $ band |
| shopify-cro-audit | 1 | 1 | commercial | full report |
| is-your-store-ready-for-meta-ads | 1 | 1 | commercial | ad-readiness verdict |
| why-your-shopify-store-isnt-converting | 1 | 1 | informational | verdict + fixes |
| why-customers-abandon-cart-2026 | 1 | 1 | informational | modeled |
| new-free-shopify-tools-2026 | 1 | 1 | informational | the Free audit |
| store-audit-review-my-store-feedback | 1 | 1 | informational | annotated screenshot |
| shopify-product-page | 0 | 0 | informational | annotated screenshot + `urgent` fixes |

Counts above 2 for a single visitor are mostly repeat visits (`shopify-store-analyzer` has 215 views from 7 visitors); rank by unique visitors, not views. Do not draw conclusions from differences of one or two visitors.
