import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundDownStoreCount } from "@/lib/library/winning-sites-count";

test("store count rounds DOWN: tens under 100, hundreds above", () => {
  assert.equal(roundDownStoreCount(57), 50);
  assert.equal(roundDownStoreCount(99), 90);
  assert.equal(roundDownStoreCount(100), 100);
  assert.equal(roundDownStoreCount(187), 100);
  assert.equal(roundDownStoreCount(250), 200);
});

test("Reviews and TrustBand share the one visibility helper", () => {
  const reviews = readFileSync("components/marketing/reviews.tsx", "utf8");
  const band = readFileSync("components/marketing/trust-band.tsx", "utf8");
  assert.match(reviews, /getReviewsVisibility/);
  assert.match(band, /getReviewsVisibility/);
  assert.doesNotMatch(reviews, /reviews.lengths*</);
});

test("trust band copy never claims the score is anchored in the winners DB", () => {
  const src = readFileSync("lib/i18n/messages.ts", "utf8");
  const block = src.slice(src.indexOf("trustBand: {"), src.indexOf("trustBand: {") + 4000);
  assert.doesNotMatch(block, /anchored|grounded|anclad/i);
});
