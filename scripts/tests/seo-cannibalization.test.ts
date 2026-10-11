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

test("no post targets a keyword reserved for the homepage", () => {
  const reserved = new Set(HOME_RESERVED.map(norm));
  for (const p of allPosts()) {
    assert.ok(!reserved.has(norm(p.keyword)), `${p.slug} uses reserved keyword "${p.keyword}" as its primary`);
    for (const kw of p.keywords ?? []) {
      assert.ok(!reserved.has(norm(kw)), `${p.slug} lists reserved keyword "${kw}" in keywords`);
    }
  }
});
