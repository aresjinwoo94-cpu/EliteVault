/**
 * Liquid Blocks WP-F.7 — how tall a full-page capture is allowed to be.
 *
 * Extracted from the pipeline because it is the one part of the new capture
 * that can be wrong in a way no screenshot reveals: a clamp that returns zero
 * makes Chromium throw, and one that returns the document height unchanged
 * hands a storefront's 20,000px marketing page to a JPEG encoder on every run.
 * Neither is visible by looking at a preview that worked.
 */

/**
 * The height to photograph, in CSS pixels.
 *
 * Three rules, in order:
 *
 *  - never taller than `max` — the ceiling exists because a full-page shot is
 *    unbounded by nature, and one long page should not cost minutes and
 *    megabytes on every preview;
 *  - never shorter than one viewport — a page that reports a tiny scrollHeight
 *    (a store still hydrating, a document with an absolutely-positioned body)
 *    would otherwise produce a sliver, or a zero, which Chromium refuses;
 *  - a whole number, because a fractional clip is rounded by the browser
 *    anyway and the client sizes its scroller from what we record here.
 */
export function captureHeight(
  documentHeight: number,
  viewportHeight: number,
  max: number,
): number {
  const floor = Math.max(1, Math.round(viewportHeight));
  const ceiling = Math.max(floor, Math.round(max));
  if (!Number.isFinite(documentHeight)) return floor;
  return Math.min(ceiling, Math.max(floor, Math.round(documentHeight)));
}

/** True when the page was taller than we were willing to photograph. */
export function wasTruncated(
  documentHeight: number,
  viewportHeight: number,
  max: number,
): boolean {
  return (
    Number.isFinite(documentHeight) &&
    Math.round(documentHeight) > captureHeight(documentHeight, viewportHeight, max)
  );
}
