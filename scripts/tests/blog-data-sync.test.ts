import { test } from "node:test";
import assert from "node:assert/strict";
import { roasRangeForAudit } from "../../lib/meta/roas-range";
import { roasRange } from "../../docs/blog-data/roas-model.mjs";

test("docs/blog-data/roas-model.mjs matches lib/meta/roas-range.ts on a grid of scores and niches", () => {
  const niches = ["", "skincare", "supplement", "jewelry", "pet", "apparel", "home", "fitness", "electronics", "food", "toy", "accessories", "unknown-niche"];
  for (const niche of niches) {
    for (let score = 0; score <= 100; score += 5) {
      assert.deepEqual(roasRange(score, niche), roasRangeForAudit(score, niche), `score ${score}, niche "${niche}"`);
    }
  }
});
