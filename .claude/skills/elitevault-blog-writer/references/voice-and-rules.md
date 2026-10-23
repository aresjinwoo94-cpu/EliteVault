# Voice and rules

## 1. Usefulness first (the mother rule)
- **Value test.** The post must serve and be able to rank if the reader never uses EliteVault. If removing the product blocks and CTAs leaves it hollow, it is not finished. The reviewer runs this test.
- The first sentence answers the keyword (the exact keyword, lowercase-insensitive, in the first sentence of the lede). Cover what the top 5 results cover, then add what only EliteVault has.
- No filler. Length follows intent: commercial 1,500–2,200 words, support 1,200–1,800, long-tail 900–1,300. A section is added only if it answers something this reader expects.

## 2. EliteVault as evidence, not as an ad
- At least **one** "EliteVault in action" block (ideal two), tied to the exact topic of the post. It shows a real output of the matching feature, explains what it means and what the reader should do with it (`evidenceBlock` in `lib/blog/post-helpers.ts`).
- **Proportion:** product content (in-action blocks + CTAs) ≤ ~30% of the body. The script reports it.
- **Honest stories beat inflated ones.** A projected loss that tells the reader to fix trust before spending is worth more than a hero result. The stored example is `docs/blog-data/example-loss-projection.json` (0.60x / 0.64x / 0.65x modeled ROAS; recommendation: fix trust and photography first).
- Name EliteVault with **"(ours — full disclosure)"** the first time.
- Every time a feature is mentioned, **say which plan has it** (inventory `docs/blog-assets-inventory.md` §0, verified in code). Never promise in a CTA what the entry plan does not give.
- No testimonials, no customer counts, no sales results, no "most popular", no scarcity.

## 3. Labels and vocabulary for numbers
| Kind | Say | Never say |
|---|---|---|
| Simulator / ROAS range / conversion bands / $ potential band / winners' revenue | "modeled", "projected", "estimate", "from an EliteVault audit (modeled projection)" | "you will earn", "guaranteed", "predicts" |
| Own aggregates | "n = X stores, from [date] to [date]" + the query in `docs/blog-data/` | a percentage without n; any cut with n < 30 as a statistic |
| Self-selected sample | "stores audited with EliteVault (self-selected)" | "Shopify stores on average" |
| External figures | link to the primary source, quote scope and year | a figure from memory; "studies show" without a link |
| Product-internal assumptions | "EliteVault's model assumes …" | presenting niche tables, "60–70% of campaigns lose money in week 1" or "iOS under-reporting 20–35%" as industry facts (they are unsourced inside the product) |

## 4. Third parties and privacy
- Own aggregates: no URLs, emails, user ids or store names. Per-niche cuts only when n ≥ 30.
- Screenshots and replicas: only the owner's audits or anonymized stores. Hide or blur URL, logo and name of any third-party store. Do not describe a store by name in prose either.
- Do not speculate about a store's revenue, business model or intent from the outside.

## 5. Structure, SEO and format (inherited rules)
- Exact keyword in slug, start of the title, h1 and first sentence (new posts). One keyword per URL; the cannibalization test stays green.
- Lede with a short answer (`<p class="lede">`) → final video (`${finalVideo}`, `video: FINAL_VIDEO_META`) → early CTA.
- 5 FAQs. Author `"Ariel Jiménez"`. `updated` = date of the PR.
- Every external figure with a link to its primary source, opened and confirmed. The Baymard 70.22% only in `abandoned-cart-recovery` and `why-customers-abandon-cart-2026`.
- **"free"** out of h1, CTAs and buttons (title only if the keyword requires it).
- Brand angle: beat the competition in the reader's niche ("unbeatable"), in the bridge to the video and the close, without forcing it. Do not mention the Shopify app (not published).
- Internal links: its hub (clusters in `docs/blog-refresh-posts-antiguos.md` §4), two siblings, and `/` with the anchor "Shopify store audit". Descriptive anchors, never the same anchor twice in one post.
- Do not touch `app/liquid`. Do not change the `/sign-up` CTAs of posts you are not rewriting.
- Sentences: plain English, short, concrete. No hype words, no exclamation marks, no fake urgency. The site renders no italics.

## 6. Visuals
- **Diagrams (≥2 per post):** `blogFigure()`: `viewBox="0 0 300 H"`, `role="img"` + `<title>` + `<desc>`, teal `#2DD4BF`, no gold, text ≥14px, < 8 KB, no JS, legible at 360px. Check by DOM (`getBBox` inside the viewBox, no overlapping texts) and by screenshot.
- **Product visuals:**
  1. Prefer an **HTML/SVG replica** that uses the real values of the output. Caption: "From an EliteVault audit (modeled projection)".
  2. A real capture is allowed only of the owner's audits or anonymized stores. Generate it with a script in `scripts/blog/` (the stack has `puppeteer-core` and `sharp`), crop to the explained component, export `public/blog/<slug>/*.webp` ≤ 150 KB with `width`, `height`, `loading="lazy"` and a descriptive `alt`.
  3. Commit the script so the capture is repeatable.

## 7. CTAs
- Specific to the topic **and true for the plan of entry**. Entry CTAs (anonymous/Free): "See your store's modeled 7-day ROAS range →", "Find what to redesign first on your store →", "Run the audit on your store →". "See your store's 7-day ROAS scenarios →" is only for a reader who already has Pro/Scale or after the post has said that the 3 scenarios need Pro, Scale or the $7 unlock. No "free".
- Three per post, `utm_content` = `early` (before the first third), `showcase` (right after the in-action block), `end`. UTMs: `utm_source=blog&utm_medium=inline&utm_campaign=<slug>&utm_content=<position>` (`blogCta` writes them).
- After the showcase, state the honest next step: what unlocks next ($7 unlock for one audit; Pro from $19/mo; Scale $29/mo) and why it would help *this* reader.

## 8. Where it can go wrong (checked in review)
Claiming a screen that depends on an unconfirmed production flag (see the inventory) · promising the Simulator to a Free reader · describing the Optimizer as Pro · quoting product-internal assumptions as industry facts · a statistic without n · a store identifiable in a capture · a post that only works as an ad.
