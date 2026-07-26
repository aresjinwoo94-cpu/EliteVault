# Blog editorial TODO — SEO priority queue

> Set up by the SEO hardening pass (Part 1 of the checkout-recovery-and-seo
> brief). **Claude Code did not write any of these articles** — this is a
> prioritized backlog for Ariel to fill in. Posts live in
> [`lib/blog/posts.ts`](./posts.ts); follow the existing `BlogPost` shape.

## Priority queue — bottom-of-funnel → top-of-funnel

Ordered by buyer intent: the first items convert warmest traffic (someone
comparing tools / actively diagnosing a problem), the last build top-of-funnel
authority.

1. `free shopify store audit` — **already covered** by the `/free-website-audit`
   landing. No new post needed; keep the landing as the canonical target.
2. `why is my shopify store not converting` — partially covered by the existing
   post `why-your-shopify-store-isnt-converting`. Verify it targets this exact
   phrase; if not, tighten the H1/title. (No rewrite without Ariel's OK.)
3. `ecommerce conversion rate benchmarks 2026` — NEW. High commercial intent,
   pairs with the existing `good-conversion-rate-for-shopify` post (cross-link).
4. `above the fold ecommerce best practices` — NEW.
5. `dtc landing page best practices` — NEW.
6. `auditmystore alternative` — NEW. Comparison / competitor-intent, mirrors the
   pattern of the existing `/convertmate-alternative` landing.
7. `best free shopify audit tools 2026` — NEW. Listicle intent; also pursue
   inclusion in *other* sites' "best audit tools" listicles (see manual steps).

## Existing posts — CTA / opening-answer audit (done, per brief §1.2)

The brief asks to confirm that every post (a) answers its target question in
the first ~200 words and (b) links to the Analyzer (CTA), and to **note**
(not rewrite) any that don't. Full read-through of all 7 posts in `posts.ts`:

| Post | Opens with answer (~200w)? | Analyzer CTA? | Link used |
|------|:---:|:---:|------|
| free-website-audit-tools | ✅ | ✅ | `/free-website-audit` |
| reverse-engineer-winning-shopify-stores | ✅ | ✅ | `/#analyzer` |
| ecommerce-store-audit-vs-consultant | ✅ | ❌ **gap** | none (only a `/blog/...` internal link) |
| why-meta-ads-arent-converting | ✅ | ⚠️ **weak** | `/#pricing` only — names the analyzer but doesn't link it |
| how-to-increase-shopify-conversion-rate | ✅ | ✅ | `/sign-up?next=/app/analyzer` + `/pricing` |
| good-conversion-rate-for-shopify | ✅ | ✅ | `/sign-up?next=/app/analyzer` |
| why-your-shopify-store-isnt-converting | ✅ | ✅ | `/sign-up?next=/app/analyzer` |

### Action items (need Ariel's OK — do NOT let Claude Code rewrite copy)

1. **`ecommerce-store-audit-vs-consultant`** — the whole post sells the AI
   audit but never links to it. Add a CTA to the analyzer (e.g.
   `/sign-up?next=/app/analyzer` or `/free-website-audit`), ideally in the
   "What a 60-second AI audit actually returns" section or the closing math
   paragraph. Highest-priority fix: this is a warm-intent post leaking its CTA.
2. **`why-meta-ads-arent-converting`** — names "EliteVault's analyzer" in the
   final section but only links `/#pricing`. Add a direct analyzer link on the
   "Diagnose the store like a cold visitor" paragraph so the CTA matches the
   copy.

All 7 open with their answer in the first ~200 words — no opening-answer fixes
needed.

> Note: the brief mentioned "9 posts"; the repo currently has **7** in
> `posts.ts`. Two of the queued NEW topics above would bring it back toward 9.
