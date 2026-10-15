import { test } from "node:test";
import assert from "node:assert/strict";
import { allPosts } from "../../lib/blog/posts";

/**
 * Anti-cannibalization guard (docs/seo-cannibalization-fix.md, WP-5).
 *
 * One primary keyword per URL. The home owns the "store audit" and
 * "shopify store analyzer" families; no blog post may chase them, and no two
 * posts may chase the same query. Without this, Google splits the signal
 * across our own pages and none of them consolidates.
 */

const norm = (s: string) => s.trim().toLowerCase();

/** Reserved for the homepage — see app/page.tsx. */
const HOME_RESERVED = [
  "store audit",
  "free store audit",
  "free shopify store audit",
  "shopify store audit",
  "shopify store analyzer",
  "store analyzer",
];

test("no two posts share the same primary keyword", () => {
  const seen = new Map<string, string>();
  for (const p of allPosts()) {
    const k = norm(p.keyword);
    const other = seen.get(k);
    assert.equal(other, undefined, `"${p.keyword}" is the primary keyword of both ${other} and ${p.slug}`);
    seen.set(k, p.slug);
  }
});

test("no post lists another post's primary keyword in its keywords", () => {
  const owner = new Map(allPosts().map((p) => [norm(p.keyword), p.slug]));
  for (const p of allPosts()) {
    for (const kw of p.keywords ?? []) {
      const o = owner.get(norm(kw));
      if (o && o !== p.slug) {
        assert.fail(`${p.slug} lists "${kw}" in keywords, but it is the primary keyword of ${o}`);
      }
    }
  }
});

test("no post title, h1 or keyword contains a homepage-reserved phrase", () => {
  // Catches variants the exact-match rule misses ("free store audit tool",
  // "shopify store analyzer free"), and the visible title / H1 too.
  const phrases = HOME_RESERVED.map(norm);
  for (const p of allPosts()) {
    const fields: [string, string][] = [
      ["title", p.title],
      ["h1", p.h1],
      ["keyword", p.keyword],
      ...(p.keywords ?? []).map((k): [string, string] => ["keywords", k]),
    ];
    for (const [name, value] of fields) {
      for (const ph of phrases) {
        assert.ok(!norm(value).includes(ph), `${p.slug} ${name} "${value}" contains reserved phrase "${ph}"`);
      }
    }
  }
});

test("no post targets a keyword reserved for the homepage", () => {
  const reserved = new Set(HOME_RESERVED.map(norm));
  for (const p of allPosts()) {
    assert.ok(!reserved.has(norm(p.keyword)), `${p.slug} uses reserved keyword "${p.keyword}" as its primary`);
    for (const kw of p.keywords ?? []) {
      assert.ok(!reserved.has(norm(kw)), `${p.slug} lists reserved keyword "${kw}" in keywords`);
    }
  }
});

test("first-sale posts exist with their exact keyword, the final video and at least 2 diagrams", () => {
  const expected: [string, string][] = [
    ["abandoned-cart-recovery", "abandoned cart recovery"],
    ["shopify-product-page", "shopify product page"],
    ["shopify-cro-audit", "shopify cro audit"],
  ];
  const posts = allPosts();
  for (const [slug, keyword] of expected) {
    const p = posts.find((x) => x.slug === slug);
    assert.ok(p, `missing post ${slug}`);
    assert.equal(p.keyword, keyword);
    assert.ok(norm(p.title).startsWith(keyword), `${slug} title must start with the keyword`);
    assert.ok(norm(p.h1).includes(keyword), `${slug} h1 must contain the keyword`);
    assert.ok(norm(p.bodyHtml.replace(/<[^>]+>/g, " ")).includes(keyword), `${slug} body must contain the keyword`);
    assert.ok(p.bodyHtml.includes("43CfVNIds7Q"), `${slug} must embed the final video`);
    assert.ok((p.bodyHtml.match(/<svg/g) ?? []).length >= 2, `${slug} needs at least 2 inline diagrams`);
    assert.equal(p.video?.id, "43CfVNIds7Q", `${slug} must declare the VideoObject`);
    assert.ok(!/\bfree\b/i.test(p.title + " " + p.h1), `${slug} title/h1 must not say "free"`);
    assert.ok(!/#d4af37|champagne|gold/i.test(p.bodyHtml), `${slug} diagrams must not use gold`);
  }
});

test("the CRO audit cost post no longer chases the shopify cro audit family", () => {
  const p = allPosts().find((x) => x.slug === "ecommerce-store-audit-vs-consultant");
  assert.ok(p);
  assert.equal(p.keyword, "cro audit cost");
  for (const kw of p.keywords ?? []) {
    assert.ok(!["shopify cro audit", "shopify cro audit report", "ecommerce cro audit"].includes(norm(kw)), `still lists "${kw}"`);
  }
});
