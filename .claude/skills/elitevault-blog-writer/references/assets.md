# EliteVault assets: what a post can show

Source of truth: **`docs/blog-assets-inventory.md`** (every plan claim there is read from code, with the file). Read it for details and live numbers. This page is the working summary. If the code changed since 2026-10-22, re-verify the plan before you write.

## Plans (what each reader actually gets)
| | Anonymous | Free | $7 unlock (one audit) | Pro $19/mo | Scale $29/mo |
|---|---|---|---|---|---|
| Audits | 1 per IP per day (default) | 1 lifetime | unlocks an existing audit | 40/mo | 200/mo |
| Annotated screenshot, fix #1, ad-readiness verdict | yes | yes | yes | yes | yes |
| Modeled ROAS **range** panel | yes | yes | yes | no (they see the Simulator / gauges) | no |
| $ potential band | in the report only with `ANALYZER_REPORT_V2` on (default off); dashboard and share image show it | | | | |
| Fixes #2+ with the how-to, buyer persona, 3 fix tracks, winners in niche | locked (server removes the data) | locked | yes | yes | yes |
| Meta Campaign Scenario Modeler (3 scenarios) | no | no | **1 projection** for that audit | **1 per month** | unlimited |
| Meta Ads Optimizer | no | no | no | no (locked preview) | **yes** |
| Library | no | 3 stores with metrics | — | full + image search | full + image search |
| Community publish / Compare | no | no | no | yes | yes |

Rule: a CTA for a Free/anonymous reader promises only audit + verdict + $ band + ROAS range + fix #1 + annotated screenshot. Anything else must say what unlocks it.

## Topic → evidence
| Topic | Primary | Secondary | Reader needs |
|---|---|---|---|
| Why isn't my store converting / CRO | verdict, annotated screenshot, $ band, ranked fixes | fix tracks | Free (fix #1); $7 for the rest |
| Ready for Meta ads | ad-readiness verdict + blockers | modeled ROAS range | Free |
| Meta ads not converting | modeled ROAS range, verdict | Simulator scenarios | Free; Pro/Scale or $7 for scenarios |
| Increase ROAS | Simulator (win condition, risks, tactical move, 7-day curve) | Optimizer targets, verdict | Pro 1/mo, Scale; Optimizer = Scale |
| Store redesign | annotated screenshot, category scores, theme/colors and competitor tracks | Library, winners in niche | Free (fix #1); tracks need unlock/Pro |
| Winning stores | Library, winners in niche | competitor track, similarity search | Free = 3 stores |
| Generative AI | buyer persona, how the audit reasons | fix `evidence` rule | persona needs unlock/Pro |

## Real material available in the repo
- **Own aggregates (values dated: n = 134 distinct stores on 2026-10-22, window 2026-06-02 → 2026-10-22; always re-run and quote the n and window in the JSON, never these numbers):** `docs/blog-data/a2-aggregates.json`. Re-run `node docs/blog-data/a2-aggregates.mjs` for fresh figures. The sample is self-selected. Per-niche cuts are not publishable yet (every niche < 30).
- **Real loss projection** (home-decor store, score 56, `not_ready`, AOV $35, $100/day; modeled ROAS 0.60x / 0.64x / 0.65x): `docs/blog-data/example-loss-projection.json`. It stores only numbers; render it with `simulatorReplica()` inside `evidenceBlock({ kind: "modeled" })`. Confirm the store is the owner's before quoting its blockers. No stored real Optimizer output exists.
- **Library:** 97 published, live stores (83 Shopify-verified, 13 with teardowns) as of 2026-10-22.
- **YouTube:** `docs/blog-youtube-videos.json` (8 videos). Default `43CfVNIds7Q`. No transcripts: attribute nothing beyond title and description.

## Do not repeat (unsourced inside the product)
"~60–70% of new Meta campaigns lose money in week 1" (narrative prompt) · "iOS under-reports conversions 20–35%" (modeling constant) · the niche benchmark tables as industry data. Also do not copy the `/meta-ads-forecast` meta description ("Free Meta Ads simulator"): Free gets the ROAS range, not the 3-scenario Simulator.

## Unconfirmed in production (ask the owner before describing)
Flags `ANALYZER_REPORT_V2`, `ENABLE_NICHE_WINNERS`, Growth Map/map-spine flags. Their code defaults are off; Vercel is not readable from the dev machine.
