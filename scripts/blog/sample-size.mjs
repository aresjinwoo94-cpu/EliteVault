// Illustrative A/B sample sizes used in the `ab-testing` post.
// Two-proportion test, 5% two-sided significance, 80% power, normal approximation.
// Usage: node scripts/blog/sample-size.mjs [baseline=0.014]
const za = 1.959964; // z for alpha/2 = 0.025
const zb = 0.841621; // z for power 0.80

export function perVariant(p1, p2) {
  const pb = (p1 + p2) / 2;
  const a = za * Math.sqrt(2 * pb * (1 - pb));
  const b = zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((a + b) ** 2 / (p2 - p1) ** 2);
}

if (process.argv[1]?.endsWith("sample-size.mjs")) {
  const base = Number(process.argv[2] ?? 0.014);
  for (const rel of [0.1, 0.2, 0.5]) {
    const n = perVariant(base, base * (1 + rel));
    console.log(`baseline ${(base * 100).toFixed(1)}%  +${rel * 100}% relative: ${n.toLocaleString("en-US")} per version, ${(2 * n).toLocaleString("en-US")} total`);
  }
}
