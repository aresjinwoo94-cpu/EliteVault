# QA checklist (run before every blog PR)

Attach the result to the PR as ✓/✗ per post. The mechanical part is one command; the manual part is ticked by the implementer and re-done by the adversarial subagent.

```bash
npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server scripts/blog/qa-check.mts <slug>:<T1|T2|T3> [<slug>:<tier> ...] [--new]
```

`--new` is for new posts: it also requires slug = keyword, the title to start with it and the h1 to contain it. The script exits 1 if any line fails.

## A. Mechanical (scripts/blog/qa-check.mts)
| Check | Rule |
|---|---|
| Lede and keyword | `<p class="lede">`; exact keyword in the first sentence |
| New posts only | slug = hyphenated keyword; title starts with it; h1 contains it |
| Author / updated / FAQ | "Ariel Jiménez"; `updated` set; exactly 5 FAQs |
| Video | final video embedded and `video: FINAL_VIDEO_META` |
| Length | inside the tier range (T1 1,500–2,200 · T2 1,200–1,800 · T3 900–1,300) |
| CTAs | three `blog-cta` paragraphs with `utm_content` early / showcase / end; UTMs correct; the early one before the first third; no "free" in the h1 or CTA text |
| Evidence | ≥ 1 `data-ev="in-action"` block (ideal 2); each states its plan ("Available on:"); product share (blocks + CTAs) ≤ 30% of the body |
| Disclosure | "(ours — full disclosure)" present |
| Diagrams | ≥ 2 SVG; `role="img"` + title + desc; < 8 KB; no gold; font-size ≥ 14 |
| Images | alt, width, height, `loading="lazy"` |
| Sources and links | ≥ 3 external links; 70.22 only in the two cart posts; internal `/blog/` links exist; no duplicate anchors; `/` linked as "Shopify store audit" |

Also run: `npm test` (cannibalization + format must pass; the post's slug is in the REFRESHED map with its tier) and `npx tsc --noEmit` (no new errors in `lib/blog`; the baseline is the number on `main`).

## B. Manual (reviewer and adversarial subagent)
| # | Check | How |
|---|---|---|
| 1 | **Value test** | Read the post with every in-action block and CTA removed. Is it still useful, complete and rankable? Say what is missing, if anything. |
| 2 | Plan mentions match the code | For each feature the post names, open the gating code (`lib/stripe/plans.ts`, `client-payload.ts`, `fix-tracks.ts`, `meta-simulator.ts`, `report-unlock.ts`) and confirm the plan stated. No CTA promises more than the entry plan gives. |
| 3 | Own figures | Each has its re-runnable query in `docs/blog-data/` with n ≥ 30 and the sample line "n = X, from … to …". No cut with n < 30 shown as a statistic. |
| 4 | Modeled numbers labeled | Simulator, ROAS range, $ band, conversion bands, winners' revenue say "modeled" / "projected" / "estimate". |
| 5 | External figures | Open the source for each (the subagent opens at least one per post) and confirm the number, scope and date. |
| 6 | Nothing invented | No testimonials, customer counts, results, or features outside the plan. No product-internal assumption presented as an industry fact (`references/assets.md`). |
| 7 | Privacy | Captures and replicas show no URL, logo or name of a third-party store; aggregates carry no PII. |
| 8 | Unconfirmed flags | No screen described that depends on a flag whose production value is unconfirmed. |
| 9 | SERP gap | The PR lists what the top 5 results cover that the draft covers too, and the gap this post fills. |
| 10 | Visual check | Each diagram and in-action block at 360px and 1280px: no clipped or overlapping text, `scrollWidth ≤ innerWidth`, video is a thumbnail until clicked. |
| 11 | Structured data | JSON-LD BlogPosting + FAQPage (5) + VideoObject render. Canonical is self-referencing. |
| 12 | Cannibalization | `keywords` do not overlap another post; hub and sibling links added; the other posts' `keywords` adjusted if needed. |
| 13 | Rewrites only | slug, `keyword`, `date` unchanged; the section that answered the keyword is still there (compare H2 before/after). |

## C. PR report template
```
### <slug> (<tier>)
Decisions: pattern chosen and why · product evidence chosen and why · route to try and why
SERP gap: …
QA: <paste qa-check table> · manual: value test ✓/✗ … (one line each)
Sources opened: <list>
Not verified: <list>
Index in Search Console: <urls>
```
