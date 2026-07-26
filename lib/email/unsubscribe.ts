import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed unsubscribe links for the abandoned-checkout recovery emails.
 *
 * The link carries the Stripe checkout `session_id` plus an HMAC signature so
 * the /api/email/unsubscribe route can trust it without a login. The secret is
 * EMAIL_UNSUBSCRIBE_SECRET; if it's unset the signature can't be produced or
 * verified (verify returns false), which fails safe — no valid opt-out link
 * exists until the secret is configured.
 */

function sign(sessionId: string): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

/** Build the absolute one-click unsubscribe URL for a recovery session. */
export function buildUnsubscribeUrl(sessionId: string, appUrl: string): string {
  const params = new URLSearchParams({ sid: sessionId, t: sign(sessionId) });
  return `${appUrl}/api/email/unsubscribe?${params.toString()}`;
}

/** Constant-time verify of a (sessionId, signature) pair. */
export function verifyUnsubscribe(sessionId: string, sig: string): boolean {
  if (!process.env.EMAIL_UNSUBSCRIBE_SECRET) return false;
  const expected = sign(sessionId);
  if (!expected || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
