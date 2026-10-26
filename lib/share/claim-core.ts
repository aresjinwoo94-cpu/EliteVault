import { createHash, randomBytes } from "node:crypto";

/**
 * Pure helpers of the claim flow (docs/design-share-claim-unlock-reaudit.md). No I/O, so they are unit-tested.
 *
 * Token: 32 random bytes, base64url, put in the outreach link as `?c=<token>`. Only its SHA-256 hash is stored
 * (analysis_claim_tokens.token_hash): a database read never yields a usable link.
 */

export function generateClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A token as it should look in a URL (base64url, 43 chars for 32 bytes). Rejects junk before any query. */
export function looksLikeClaimToken(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
}

/** Max live tokens the owner can have issued for one audit (copying the message twice is normal; hundreds is not). */
export const MAX_TOKENS_PER_AUDIT = 20;

/** Max claims one account may make in 24 h (enforced in the RPC; mirrored here for the message). */
export const MAX_CLAIMS_PER_DAY = 3;

const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");

/**
 * Does the claimant's (verified) email belong to the store's domain? `me@shop.com` matches `shop.com` and
 * `www.shop.com`; `me@mail.shop.com` matches too. Webmail never matches. It is a signal for the owner, not a proof.
 */
export function emailMatchesStore(email: string | null | undefined, storeUrl: string | null | undefined): boolean {
  if (!email || !storeUrl) return false;
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const emailDomain = strip(email.slice(at + 1).trim());
  let host = "";
  try {
    host = strip(new URL(storeUrl).hostname);
  } catch {
    return false;
  }
  if (!emailDomain || !host) return false;
  return emailDomain === host || emailDomain.endsWith(`.${host}`) || host.endsWith(`.${emailDomain}`);
}

/** The claim route's error codes → the `?claim=` value shown on the public page. */
export type ClaimFailure = "used" | "rate" | "verify" | "error";

export function claimFailureFromRpc(message: string | null | undefined): ClaimFailure {
  const m = message ?? "";
  if (m.includes("invalid_or_used") || m.includes("not_found")) return "used";
  if (m.includes("rate_limited")) return "rate";
  return "error";
}
