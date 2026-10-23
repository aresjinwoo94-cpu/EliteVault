# EliteVault — inventory of what a blog post can show (A1)

**Written:** 2026-10-22 from `origin/main` (14a2179). **Every plan claim below is read from code**, with the file that enforces it. Where the code cannot settle something (production environment variables), it says so.

How to use it: before writing a post, find the feature that matches the topic, check its **plan** column, and write the CTA for what the plan of entry really gives. The skill (`.claude/skills/elitevault-blog-writer/`) summarizes this file in `references/assets.md`.

---

## 0. Plans in one table (source: `lib/stripe/plans.ts`, `lib/unlocks/*`, `lib/analyzer/client-payload.ts`)

| | Anonymous (pre-login audit) | Free account | $7 unlock (one audit) | Pro $19/mo | Scale $29/mo |
|---|---|---|---|---|---|
| Full audit of a store | yes (1 per IP per day by default, `ANON_AUDIT_LIMIT_PER_DAY`) | **1 lifetime** audit (welcome credit; `profiles.credits` default 1, no refill) | — (unlocks an audit you already have) | 40 / month | 200 / month |
| Annotated screenshot (pins + problem text) | yes | yes | yes | yes | yes |
| Fix #1 in full | yes | yes | yes | yes | yes |
| Fixes #2+ (the how-to) | titles only, locked | titles only, locked | **yes** | yes | yes |
| Buyer-persona reaction | locked (server withholds it) | locked | **yes** | yes | yes |
| Ad-readiness verdict | yes | yes | yes | yes | yes |
| $ potential band | in the report **only with `ANALYZER_REPORT_V2` on** (default off; the report then shows the Growth Map rank bands instead); the dashboard and the share image show it | same | same | same | same |
| Modeled 7-day ROAS **range** panel (`FreeMetaPanel`) | yes | yes | yes | **no** (they see the conversion gauges and the Simulator instead) | **no** (same) |
| Fix Tracks (3 generated + urgent) | `urgent` + **one** generated track of your choice, fix #1 of it | same | all 3, all fixes | all | all |
| Winners in your niche (module) | none | none (`gateWinners` returns `[]`) | yes, with links | yes | yes |
| Library of winning stores | — | 3 stores with full metrics | — | full + image-similarity search | full + image search |
| **Meta Campaign Scenario Modeler** (3 scenarios) | no | no (`metaRunsPerMonth: 0`) | **1 projection for that audit** | **1 / month** | unlimited |
| **Meta Ads Optimizer** (CPC/CPM/CTR/ROAS targets) | no | no | no | no (locked preview) | **yes** |
| Publish to Community / Compare Mode | no | no | no | yes | yes |
| API | no | no | no | no | yes |

Evidence: `PLANS` (`quotas.analysesPerMonth`, `metaRunsPerMonth`, `libraryFullMetricsCap`, `unlocksScale`, `canPublish`); `gateResult` / `toClientAnalysis` in `lib/analyzer/client-payload.ts` (the server removes locked data; it is not blurred); `decideAccess` / `gateFixes` in `lib/analyzer/fix-tracks.ts`; `hasFullReport` + `REPORT_UNLOCK_USD_CENTS = 700` in `lib/unlocks/report-unlock.ts`; `triggerSimulation` in `app/actions/meta-simulator.ts` (quota guard, then `unlockedProjectionAllowed`); `meta_ads` is returned only when `canSeeOptimizer` (Scale). The unlock does **not** give publishing, the Optimizer or new audits (comment in `report-unlock.ts`).

**Rule for CTAs:** a Free reader gets one audit, the verdict, the $ potential band, the modeled ROAS range, fix #1 and the annotated screenshot. Never promise "your 7-day scenarios", "every fix", "the buyer persona" or "winners in your niche" to someone entering through a Free/anonymous CTA, unless the post says what unlocks it ($7 for one audit, or Pro/Scale).

### Things the code cannot confirm (ask the owner; do not assume in a post)
- **Production env flags.** Vercel is not reachable from the working machine (CLI not logged in). Defaults in `lib/flags.ts`: `ANALYZER_REPORT_V2` **off** (the report then shows the Growth Map and the 0–100 score), `ENABLE_NICHE_WINNERS` **off** (set on in `.env.local` only), `ANALYZER_FIX_TRACKS` on, `ANALYZER_META_PROMO` on, `REPORT_UNLOCK` on (since Oct 2026). A post must not describe a screen that depends on a flag until the owner confirms the production value.
- **Public copy that over-promises.** `app/meta-ads-forecast/page.tsx` has a meta description that says "Free Meta Ads simulator … No card to start", but the 3-scenario Simulator is Pro/Scale (or one projection with the $7 unlock). What Free gets is the modeled ROAS range panel. Do not repeat that wording; consider fixing it in a separate PR.

---

## 1. Features, what they show, where they fit

### 1.1 Analyzer report (the core audit)
- **Shows:** annotated screenshot (arrows, circles, crosses, highlights, labels, each with severity `low|medium|high`, a problem message and a fix), `summary`, 6 category scores (`color_integration`, `layout_proportion`, `image_quality`, `technical_optimization`, `niche_coherence`, `cro_principles`), ranked `top_fixes` (title, impact `high|medium|low`, effort `S|M|L`, a business `why`), `ad_readiness` (verdict `ready|almost|not_ready`, a 0–100 score judged only for cold paid traffic, a summary and up to 5 blockers), buyer-persona reaction (headline, quotes, would-buy, reasons), `potential_why` (2–3 reasons behind the $ band), `observed_palette`. Schema: `ai/schemas.ts`.
- **How it works (safe to explain):** it reads a **screenshot of the live storefront**, not analytics or the checkout flow. The score and the $ potential band are derived **in code** (`lib/analyzer/derive-score.ts`, `report-v2.ts`), not typed by the model. The ROAS, conversion bands and $ band are **modeled estimates**.
- **Plans:** see §0.
- **Topics:** conversion ("why isn't my store converting"), store audits, CRO, product page, redesign, ad-readiness.
- **Capture:** annotated screenshot component or an HTML replica with real values (see the skill, `references/voice-and-rules.md` §Visuals).

### 1.2 Ad-readiness verdict
- **Shows:** a verdict word (`ready` / `almost` / `not_ready`), what decides it and up to 5 blockers ranked by leverage (`AdReadinessSchema`; words via `adReadinessWords` in `lib/analyzer/report-v2.ts`).
- **Plans:** every viewer. **Topics:** Meta ads, ROAS, "is my store ready for ads", conversion.

### 1.3 $ potential band
- **Shows:** an aspirational monthly band for the store's stage, e.g. "~$20k–80k/mo", always with a "not your revenue" caveat (`potentialBandForResult`, `RANKS[i].band`).
- **Label it as:** an orientative estimate, never a claim about the store's revenue.

### 1.4 Fix Tracks
- **Tracks:** `urgent` (fixes ship with the audit, no extra AI call), `post_purchase`, `theme_colors` (can name a theme from a closed list, `lib/analyzer/shopify-themes.ts`), `competitor` (compares to a same-niche winner **that has a teardown**; otherwise an honest empty state). Each fix carries an `evidence` string tied to the store's own page; fixes with invented %/$ or generic text are dropped in code (`sanitizeFixes`).
- **Plans:** Free/anonymous: `urgent` plus ONE generated track forever, fix #1 only; paid or unlocked: everything (`decideAccess`, `gateFixes`). Flag `ANALYZER_FIX_TRACKS` (default on); needs migration 0036.
- **Topics:** redesign (theme/colors), post-purchase, competitor comparison.

### 1.4b Winners in your niche + Library
- **Library (live numbers, 2026-10-22, read-only count):** 97 published and live stores; 83 Shopify-verified; 13 with a teardown. Largest niches: apparel 11, home 10, skincare 10, baby 8, accessories 8. Free sees full metrics for **3** pre-selected stores; paid sees all; image-similarity search is paid (`app/winning-shopify-stores/page.tsx`, `lib/library/metrics-cap.ts`).
- **Winners in your niche (inside the report):** real competitor domains with modeled monthly revenue and live ad counts; only for full-report viewers; **flag default off** (see above). Revenue is a model; the only real signal on the report is the live ad count (`SIGNAL_SOURCES`, `ai/schemas.ts`).
- **Topics:** how to find winning stores, redesign (compare with the leaders), ad research.
- **Capture rule:** the Library names real third-party stores. Never show a store name, logo or URL in a screenshot unless the store is the owner's.

### 1.5 Meta Campaign Scenario Modeler (the "Simulator")
- **Inputs:** AOV, daily budget, margin % (optional), country, product type, competitiveness, notes (`app/actions/meta-simulator.ts`).
- **Engine (deterministic, `lib/meta/simulation-engine.ts`):** per day `impressions = spend/CPM·1000`, `clicks = impressions·CTR`, `purchases = clicks·CVR·attribution`, `revenue = purchases·AOV`, `ROAS = revenue/spend`. Three scenarios: conservative (spends 60% of the stated budget), balanced (100%), aggressive (140%). Days 1–3 are modeled as a learning phase (lower conversion, higher CPM). A hard ROAS ceiling by audit score applies (score <40 → 1.2x, <55 → 1.8x, <70 → 2.8x, <85 → 4x, else 5.5x) and by scenario (2.2x / 3.2x / 5x). Break-even ROAS = 100 ÷ margin %. Results carry a ROAS **range** (conservative ×0.8–1.2, balanced ×0.75–1.25, aggressive ×0.65–1.35).
- **Output per scenario:** 7-day totals (spend, revenue, purchases, ROAS, CPA, ROAS range), a day-by-day table, and AI-written text: `summary`, `win_condition`, 2–4 `risks`, `recommendation` (the UI labels it "Tactical move"). A deterministic fallback writes the text if the model fails.
- **Real example (kept in the repo):** `docs/blog-data/example-loss-projection.json`: a home-decor store, audit score 56, verdict `not_ready` (blockers: remove a fake countdown timer, add authentic social proof). AOV $35, $100/day. Modeled 7-day ROAS **0.60x / 0.64x / 0.65x** (ranges 0.48–0.72, 0.48–0.80, 0.42–0.87), i.e. a projected loss in all three. Recommendation: fix trust signals and product photography before increasing spend. This is the honest story the brief asks for. Label it "modeled projection, not a result". The stored JSON keeps **only the numbers** (totals and the 7 daily ROAS values), the niche, the score, the verdict and the blockers; the AI-written text (summary, win condition, risks, recommendation) is deliberately not stored: it characterizes a third-party business and repeats product-internal assumptions. The owner confirmed (2026-10-22) that the audited store is theirs (`owner_confirmation` in the JSON), so the blockers may be quoted; the domain is never named. **There is no stored real output of the Meta Ads Optimizer** (Scale only): to feature it, generate one from a Scale audit of a store the owner controls.
- **Plans:** Pro 1/month, Scale unlimited, $7 unlock = 1 projection for that audit (`quotas.metaRunsPerMonth`, `unlockedProjectionAllowed`). Free: no (only the range panel).
- **What must NOT be repeated from the product copy** (unsourced assertions inside prompts/fallbacks): "~60–70% of new Meta campaigns lose money in week 1" (narrative-agent system prompt); "Ads Manager under-reports conversions 20–35% post-iOS" (a modeling constant, `ATTRIBUTION = 0.75`). Present those as *model assumptions* if mentioned, never as industry facts. The niche tables (`lib/meta/niche-benchmarks.ts`, "2024-25 cold-traffic benchmark") are internal modeling inputs, not published industry data: cite them as "EliteVault's model assumes…", not as a benchmark.
- **Topics:** how to increase ROAS, Meta ads not converting, is my store ready for ads, ad budget.

### 1.6 Free modeled ROAS range panel
- **Shows:** a 7-day ROAS band from `(score, niche)` (`lib/meta/roas-range.ts`), with a "ready to scale" flag (score ≥55 and high end ≥1.8x). A weak store's low end dips below 1.0x on purpose. Worked examples in the source: score 62 skincare → 1.4x–2.8x; score 30 supplements → 0.5x–1.1x.
- **Plans:** everyone (anonymous included). **Use it as** the low-friction hook for ROAS posts: it is the one Meta-adjacent thing a Free reader really gets.

### 1.7 Meta Ads Optimizer
- **Shows:** targets for CPC, CPM, CTR, CVR and ROAS, clamped to the niche band and the audit's modeled ROAS range (`lib/meta/optimizer-targets.ts`; CPC is derived as `CPM/1000/CTR`).
- **Plans:** **Scale only**, enforced server-side. Say so in the post; do not show Optimizer output to a Pro-level CTA.

### 1.8 Buyer persona
- **Shows:** a simulated shopper's reaction in their own voice (headline, quotes, would-they-buy, reasons) from the real audit; a public explainer page exists at `/ai-buyer-persona-simulator`.
- **Plans:** locked for Free/anonymous (server returns `null` + `persona_locked`); open with the $7 unlock, Pro, Scale.
- **Explaining how the AI reaches a diagnosis:** say it reads the screenshot like a first-time visitor and returns structured findings that the product then validates (fixes need page-specific evidence; no invented %/$). Do not reveal prompts or model names.

### 1.9 Growth Map / report v2 (behind flags, default off)
- Rank map, 0–100, Copper→Ruby ranks, "map as spine" and the v2 hero are flag-gated and **off by default**. Do not feature them in posts until the owner confirms production.

### 1.10 Community and Compare Mode
- Publish an audit to the community feed, leaderboard, Compare Mode (`/app/community/compare`). **Pro and Scale.** Low priority for blog evidence (privacy: audits are of third-party stores).

### 1.11 One-time unlock ($7)
- **Gives, for ONE audit:** every top fix with the how-to, the buyer-persona simulation, all 3 fix tracks, 1 Meta campaign projection, winners in the niche with links (`unlock.i1…i5` in `lib/i18n/dict/ui-en.json`). **Does not give:** publishing, the Optimizer, new audits.
- **Use as:** the honest "next step" after a Free audit ("Auditing several stores? Pro from $19/mo").

### 1.12 Public tools that can host CTAs
- `/free-website-audit` (anonymous audit box), `/meta-ads-forecast` (anonymous audit box; see the over-promising copy note), `/ai-buyer-persona-simulator`, `/winning-shopify-stores`, `/pricing`. Deep links that exist in the code: `/sign-up?next=/app/analyzer` (the standard blog CTA). `lib/blog/posts.ts` also says forecast CTAs go to `/meta-ads-forecast`; that page exists but its copy over-promises (see above), so prefer the standard CTA. No deep link to "run a simulation" exists; the simulation lives inside a finished audit (`/app/analyzer/[id]`) for Pro/Scale.

### 1.13 YouTube channel (public)
See `docs/blog-youtube-videos.json` (8 videos, handle `@shopify-store-audit`). Default video `43CfVNIds7Q` ("Let's make your Shopify store unbeatable", 258 s). Transcripts were not accessible, so **nothing may be attributed to a video beyond its title and description**. Videos that name a third-party store (e.g. the fightwear audit) are fine to embed but must not be described by store name in a post.

---

## 2. Topic → feature → plan map (what to show in which post)

| Topic | Primary evidence | Secondary | Plan the reader needs |
|---|---|---|---|
| Why isn't my store converting / CRO | verdict + annotated screenshot + $ band + ranked fixes | fix tracks | Free (fix #1); $7 for the rest |
| Is my store ready for Meta ads | ad-readiness verdict + blockers | modeled ROAS range | Free |
| Why aren't Meta ads converting | modeled ROAS range + verdict | Simulator scenarios | Free (range); Pro/Scale or $7 for scenarios |
| How to increase ROAS | Simulator (scenarios, win condition, risks, tactical move, 7-day curve) | Optimizer targets, verdict | Pro 1/mo, Scale; $7 = 1 projection; Optimizer = Scale |
| Shopify store redesign | annotated screenshot, design category scores, fix tracks (theme/colors, competitor) | Library / winners in niche | Free (fix #1); tracks/winners need unlock or Pro |
| Product page / landing page | annotated screenshot + `urgent` fixes | competitor track | Free |
| Winning stores / competitor research | Library, winners in niche, competitor track | similarity search | Free = 3 stores; Pro = all |
| Generative AI for ecommerce | buyer persona, how the audit reasons, validation rules | fix evidence rule | Persona needs unlock/Pro |
| Tools / audits / cost | the Free plan itself, unlock | — | Free |

## 3. Honest-evidence checklist for any figure that comes from the product
1. Name the source: "From an EliteVault audit (modeled projection)" or "n = X audits, from … to …" (`docs/blog-data/`).
2. Modeled ≠ measured. ROAS, the $ band, conversion bands and revenue estimates are `ai_estimate`/model outputs.
3. Real numbers only from `docs/blog-data/` (re-runnable queries, n ≥ 30) or from a stored real output such as the loss projection above.
4. If the sample is self-selected (it is: owners who audit their own store), say so.
