import { test } from "node:test";
import assert from "node:assert/strict";
import { allPosts } from "../../lib/blog/posts";

/**
 * Blog format guard (docs/blog-refresh-posts-antiguos.md, §1).
 *
 * Every refreshed post follows the format of the three first-sale posts:
 * final video, >= 2 inline diagrams, 5 FAQs, named author, no "free" in the
 * h1, body length inside its tier. Posts not yet refreshed are only held to
 * the rules that already hold for the whole blog (no teaser, 70.22 scope,
 * video meta). Each refresh batch adds its slugs to REFRESHED.
 */

const FINAL_VIDEO_ID = "43CfVNIds7Q";
const TEASER_VIDEO_ID = "lH4O5UE4CPY";

/** Body-length tiers (words). T1 = near purchase, T2 = support, T3 = long-tail / definition. */
const TIER_MIN_WORDS = { T1: 1500, T2: 1200, T3: 900 } as const;
type Tier = keyof typeof TIER_MIN_WORDS;

/** Slugs already refreshed → their tier. Add each batch's slugs here. */
const REFRESHED: Record<string, Tier> = {
  "abandoned-cart-recovery": "T1",
  "shopify-product-page": "T1",
  "shopify-cro-audit": "T1",
  "why-your-shopify-store-isnt-converting": "T1",
  "how-to-increase-shopify-conversion-rate": "T1",
  "is-your-store-ready-for-meta-ads": "T1",
  "why-meta-ads-arent-converting": "T1",
  "ecommerce-store-audit-vs-consultant": "T1",
  "shopify-store-analyzer": "T1",
  "free-website-audit-tools": "T1",
  "reverse-engineer-winning-shopify-stores": "T1",
};

/** The only posts allowed to cite Baymard's 70.22% average abandonment rate. */
const ALLOWED_70_22 = new Set(["abandoned-cart-recovery", "why-customers-abandon-cart-2026"]);

const plainWords = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

test("no post embeds the old teaser video", () => {
  for (const p of allPosts()) {
    assert.ok(!p.bodyHtml.includes(TEASER_VIDEO_ID), `${p.slug} still embeds the teaser`);
  }
});

test("every post declares the final video (VideoObject meta)", () => {
  for (const p of allPosts()) {
    assert.equal(p.video?.id, FINAL_VIDEO_ID, `${p.slug} must declare video: FINAL_VIDEO_META`);
  }
});

test("any post that embeds the final video also declares it, and vice versa", () => {
  for (const p of allPosts()) {
    if (p.bodyHtml.includes(FINAL_VIDEO_ID)) assert.equal(p.video?.id, FINAL_VIDEO_ID, `${p.slug}`);
  }
});

test("the 70.22% Baymard figure appears only where it is allowed (refreshed posts)", () => {
  // Not-yet-refreshed posts may still carry old figures; each batch removes them
  // and adds its slugs to REFRESHED, so the whole blog is covered after the last batch.
  for (const p of allPosts().filter((x) => x.slug in REFRESHED)) {
    const hit = p.bodyHtml.includes("70.22") || (p.faqs ?? []).some((f) => f.q.includes("70.22") || f.a.includes("70.22"));
    if (hit) assert.ok(ALLOWED_70_22.has(p.slug), `${p.slug} must not cite 70.22%`);
  }
});

test("no post h1 says \"free\" unless its keyword requires it", () => {
  const keywordNeedsFree = (kw: string) => /\bfree\b/i.test(kw);
  for (const p of allPosts()) {
    if (keywordNeedsFree(p.keyword)) continue;
    assert.ok(!/\bfree\b/i.test(p.h1), `${p.slug} h1 says "free"`);
  }
});

test("refreshed posts meet the format: video, diagrams, FAQ, author, length", () => {
  const posts = allPosts();
  for (const [slug, tier] of Object.entries(REFRESHED)) {
    const p = posts.find((x) => x.slug === slug);
    assert.ok(p, `missing post ${slug}`);
    assert.ok(p.bodyHtml.includes(FINAL_VIDEO_ID), `${slug} must embed the final video`);
    assert.ok((p.bodyHtml.match(/<svg/g) ?? []).length >= 2, `${slug} needs at least 2 inline diagrams`);
    assert.ok((p.faqs?.length ?? 0) >= 5, `${slug} needs at least 5 FAQs`);
    assert.equal(p.author, "Ariel Jiménez", `${slug} author`);
    assert.ok(!/\bfree\b/i.test(p.h1), `${slug} h1 says "free"`);
    const words = plainWords(p.bodyHtml);
    assert.ok(words >= TIER_MIN_WORDS[tier], `${slug} (${tier}) has ${words} words, needs >= ${TIER_MIN_WORDS[tier]}`);
  }
});
