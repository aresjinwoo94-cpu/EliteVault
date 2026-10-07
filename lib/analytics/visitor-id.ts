/**
 * Visitor identity for the owner analytics. The tracker used to share the cookie
 * name `ev_anon` with the anonymous-audit session (lib/anon/session.ts, a signed
 * `token.signature`, 7 days). Whichever wrote last clobbered the other, which
 * split visitors and broke sign-up attribution. The tracker now owns `ev_vid`.
 *
 * A legacy `ev_anon` is adopted only when it is a plain UUID (what the old
 * tracker wrote); the audit cookie never matches, so it is never used.
 */
export const VISITOR_COOKIE = "ev_vid";
export const LEGACY_COOKIE = "ev_anon";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveVisitorId(c: {
  vid?: string | null;
  legacy?: string | null;
}): { id: string; fromLegacy: boolean } | null {
  if (c.vid) return { id: c.vid, fromLegacy: false };
  if (c.legacy && UUID_RE.test(c.legacy)) return { id: c.legacy, fromLegacy: true };
  return null;
}
