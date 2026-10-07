/**
 * Owner-panel "reset to 0" — pure core (no I/O), unit-tested.
 *
 * The reset point is a timestamp: every metric only counts data from it on.
 * Precedence: DB (`owner_settings.metrics_reset_at`) → CODE_RESET_DEFAULT_ISO
 * (the deploy date of this WP, baked into git) → env OWNER_METRICS_RESET_AT as
 * the very last fallback. Nothing in Stripe or auth is ever deleted.
 */

/** 2026-10-07 00:00 America/Guayaquil (UTC-5, no DST). */
export const CODE_RESET_DEFAULT_ISO = "2026-10-07T05:00:00.000Z";

const parse = (v: string | null | undefined) => {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

export function resolveResetAt(src: { db?: string | null; env?: string | null }): number {
  return (
    parse(src.db) ??
    parse(CODE_RESET_DEFAULT_ISO) ??
    parse(src.env) ??
    0
  );
}

/** A window never starts before the reset. */
export const clampToReset = (gteMs: number, resetMs: number) => Math.max(gteMs, resetMs);

export type ResetDeps = {
  now: () => number;
  saveResetAt: (iso: string) => Promise<void>;
  /** Deletes page_views/sessions (and anonymous visitors) older than `iso`. */
  purgeTraffic: (iso: string) => Promise<void>;
};

export type ResetResult = { resetAt: string; purged: boolean; purgeError?: string };

export async function applyReset(deps: ResetDeps, opts: { purgeTraffic: boolean }): Promise<ResetResult> {
  const resetAt = new Date(deps.now()).toISOString();
  await deps.saveResetAt(resetAt);
  if (!opts.purgeTraffic) return { resetAt, purged: false };
  try {
    await deps.purgeTraffic(resetAt);
    return { resetAt, purged: true };
  } catch (e) {
    return { resetAt, purged: false, purgeError: (e as Error).message };
  }
}
