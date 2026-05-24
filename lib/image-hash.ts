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
