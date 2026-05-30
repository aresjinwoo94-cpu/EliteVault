import "server-only";
import { createHash } from "node:crypto";

/**
 * Deterministic hash of a base64-encoded image — used as a cache key so
 * the same screenshot uploaded twice doesn't re-spend Gemini quota on the
 * niche detection step.
 */
export function imageHash(base64: string): string {
  return createHash("sha256").update(base64).digest("hex").slice(0, 32);
}

/**
 * Deterministic hash of a URL — cache key for the screenshot cache (P1.4),
 * so re-analyzing the same store skips the slow capture providers. We
 * lower-case + trim so trivial casing differences hit the same cache row.
 */
export function urlHash(url: string): string {
  return createHash("sha256")
    .update(url.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}
