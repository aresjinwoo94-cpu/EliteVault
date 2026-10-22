/**
 * Plain-language reading of a conversion band ("1.3–1.9%" -> "≈ 1–2 of 100"). Presentation only: it never changes
 * the band (conversion-scenarios.ts owns the numbers), it just rounds it honestly to whole visitors out of 100.
 */
export type OfHundred = { kind: "range"; lo: number; hi: number } | { kind: "upTo"; hi: number } | { kind: "lessThanOne" };

export function bandOfHundred(low: number, high: number): OfHundred {
  const lo = Math.round(low * 100);
  const hi = Math.round(high * 100);
  if (hi <= 0) return { kind: "lessThanOne" };
  if (lo <= 0) return { kind: "upTo", hi };
  return { kind: "range", lo, hi: Math.max(lo, hi) };
}

/** The substitution value for `{range}` in "≈ {range} of 100": "1–2" or "3". */
export function rangeText(b: Extract<OfHundred, { kind: "range" }>): string {
  return b.lo === b.hi ? String(b.lo) : `${b.lo}–${b.hi}`;
}
