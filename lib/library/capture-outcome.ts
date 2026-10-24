/**
 * How a failed hero capture is accounted for (WP-L4, owner decision 2026-10-13).
 *
 * The weekly GitHub Actions capture runs from a datacenter IP, so many stores answer 403 or an anti-bot wall.
 * Those are NOT transient: retrying them every week would hammer the store for nothing. They count as an
 * EXHAUSTED attempt — the row goes straight to the "Sin imagen" list for a manual upload. Anything else
 * (timeout, a popup that would not close, a rejected image) counts one attempt, so a row is tried at most
 * MAX_IMAGE_ATTEMPTS times in total and never loops.
 *
 * A failed capture NEVER unpublishes anything: the script only selects rows parked as `no_image` and only
 * writes attempt counters / the stamp for them.
 */
export const MAX_CAPTURE_ATTEMPTS = 3;
/**
 * The og:image job exhausts a row at MAX_CAPTURE_ATTEMPTS (3) WITHOUT ever taking a viewport capture, so those rows
 * must still be eligible for ONE capture run. The capture exhausts a row one step further (4): the og job
 * (`< 3`) and the capture (`< 4`) therefore never pick it again.
 */
export const CAPTURE_EXHAUSTED = MAX_CAPTURE_ATTEMPTS + 1;

export type CaptureFailure = "blocked" | "transient";

const BLOCKED = /\bHTTP (401|403|406|429|451)\b|bot wall|captcha|access denied|anti-?bot/i;

export function classifyCaptureFailure(message: string): CaptureFailure {
  // 5xx is the store's own outage (the verify job deals with offline stores) — retry later, not "blocked".
  if (/\bHTTP 5\d\d\b/.test(message)) return "transient";
  return BLOCKED.test(message) ? "blocked" : "transient";
}

/** The attempt counter after a failed capture. */
export function attemptsAfterFailure(current: number | null | undefined, kind: CaptureFailure): number {
  return kind === "blocked" ? CAPTURE_EXHAUSTED : Math.min(CAPTURE_EXHAUSTED, (current ?? 0) + 1);
}
