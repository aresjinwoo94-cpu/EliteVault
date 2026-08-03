import "server-only";
import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Anonymous audit session — a signed, httpOnly cookie carrying an unguessable
 * token that ties a pre-login audit to the browser that ran it.
 *
 * Why signed AND random: the token itself is 32 random bytes (unguessable), so
 * an attacker can't enumerate other people's audits. The HMAC signature is a
 * cheap tamper check — a malformed/forged cookie is rejected before it ever
 * hits the DB, so we never run a lookup on attacker-controlled garbage. The
 * value stored in the `analyses.anon_id` column is the RAW token (the part
 * before the signature), so DB lookups stay simple.
 *
 * Cookie: httpOnly (no JS access), sameSite=lax (survives the top-level
 * sign-up navigation so the audit can be claimed), secure in production.
 */

const COOKIE_NAME = "ev_anon";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days — long enough to come back and claim

/**
 * Signing secret. Prefer a dedicated secret; fall back to the Supabase service
 * key (always present server-side) so this never crashes for a missing env in
 * dev. The signature is only a tamper check, not the security boundary (the
 * token's randomness is), so the fallback is acceptable.
 */
function secret(): string {
  return (
    process.env.ANON_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dev-anon-secret-not-for-production"
  );
}

function sign(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("base64url");
}

/** Parse a `token.signature` cookie value, verifying the signature. */
function parse(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(token);
  // Constant-time compare; lengths must match first (timingSafeEqual throws otherwise).
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}

/** Read the current anon token from the request cookies, or null. */
export async function getAnonToken(): Promise<string | null> {
  const store = await cookies();
  return parse(store.get(COOKIE_NAME)?.value);
}

/**
 * Read the current anon token, or mint + set a new one. Returns the raw token
 * to store in `analyses.anon_id`. Safe to call from a Server Action (which can
 * write cookies); no-ops the write if a valid token already exists.
 */
export async function getOrCreateAnonToken(): Promise<string> {
  const store = await cookies();
  const existing = parse(store.get(COOKIE_NAME)?.value);
  if (existing) return existing;

  const token = randomBytes(32).toString("base64url");
  store.set(COOKIE_NAME, `${token}.${sign(token)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return token;
}

/** Clear the anon cookie (after the audit is claimed by an account). */
export async function clearAnonToken(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Read + verify the anon token straight off a raw Cookie header string. Used in
 * the edge auth-callback route, which doesn't go through next/headers cookies()
 * the same way. Returns the raw token or null.
 */
export function anonTokenFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === COOKIE_NAME) {
      return parse(decodeURIComponent(part.slice(eq + 1)));
    }
  }
  return null;
}

export const ANON_COOKIE_NAME = COOKIE_NAME;

/**
 * Salted, one-way hash of a client IP for the rate-limit column. We never store
 * the raw IP. The salt makes the hashes non-reversible even for the small IPv4
 * space.
 */
export function hashIp(ip: string): string {
  const salt = process.env.ANON_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "ev";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
