// Plain-JS copy of lib/meta/roas-range.ts (modeled 7-day ROAS band from audit score + niche), so the blog data
// scripts can run with plain `node`. scripts/tests/blog-data-sync.test.ts compares this copy with the real
// function on a grid of inputs and fails if they ever diverge.
export const NICHE_BANDS = [
  { keys: ["skincare", "beauty", "cosmetic", "makeup", "grooming"], band: [1.8, 3.5] },
  { keys: ["supplement", "vitamin", "health", "nutrition", "wellness"], band: [1.2, 2.5] },
  { keys: ["jewel", "jewellery", "watch"], band: [2.0, 4.0] },
  { keys: ["pet", "dog", "cat"], band: [2.0, 4.0] },
  { keys: ["fashion", "apparel", "clothing", "wear", "footwear", "shoe"], band: [1.5, 3.0] },
  { keys: ["home", "decor", "furniture", "kitchen"], band: [1.5, 3.0] },
  { keys: ["fitness", "gym", "sport", "athletic"], band: [1.5, 3.0] },
  { keys: ["electronic", "gadget", "tech"], band: [1.2, 2.5] },
  { keys: ["food", "snack", "beverage", "drink", "coffee", "tea"], band: [1.3, 2.5] },
  { keys: ["toy", "kid", "baby"], band: [1.5, 3.0] },
  { keys: ["accessor", "eyewear", "glasses"], band: [1.5, 2.5] },
];
export const DEFAULT_BAND = [1.4, 2.8];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const round1 = (n) => Math.round(n * 10) / 10;

export function roasRange(score, niche) {
  const n = (niche ?? "").toLowerCase();
  const [bl, bh] = (NICHE_BANDS.find((b) => b.keys.some((k) => n.includes(k))) ?? { band: DEFAULT_BAND }).band;
  const s = clamp(Number.isFinite(score) ? score : 0, 0, 100);
  const f = 0.35 + ((clamp(s, 20, 90) - 20) / 70) * 0.75;
  let low = round1(bl * f);
  let high = round1(bh * f);
  if (high - low < 0.3) high = round1(low + 0.3);
  low = Math.max(0.3, low);
  return { low, high, ready: s >= 55 && high >= 1.8 };
}
