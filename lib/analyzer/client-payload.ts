/**
 * What an `analyses` row may carry to the browser.
 *
 * The report pages read the row with `select("*")` and used to hand it to the
 * client component as-is. Two columns in it must never reach a viewer who
 * isn't entitled to them — a locked card that blurs data which is already in
 * the page payload is a visual treatment, not an authorization boundary (the
 * Library shipped exactly that once; see lib/library/metrics-cap.ts).
 *
 *  • `niche_winners` — the pipeline's stored "winners in your niche": real
 *    competitor domains with modeled monthly revenue and live ad counts. No
 *    client component reads it; the page derives the gated card from it
 *    server-side (gateWinners in lib/library/niche-winners.ts). So it is
 *    dropped for EVERY viewer.
 *  • `result.top_fixes` #2+ and `result.buyer_persona_response` — gated by
 *    `gateResult` below unless the viewer has the full report (WP-1).
 *  • `fix_tracks` — the Fix Tracks cache: full text of every generated track
 *    (including fixes #2+ a free viewer must not read). Served ONLY by
 *    /api/analyses/[id]/fix-tracks/[track], which gates per viewer. The page
 *    passes just the free choice (a track id) separately.
 *  • `meta_ads` — the Meta Ads Optimizer output: a SCALE feature (pricing page +
 *    owner decision 2026-10-09). It reaches Scale viewers only. Pro (who can run
 *    the Modeler but not the Optimizer — they see a locked preview), Free,
 *    anonymous, and anyone who downgraded (the row keeps the column) get null.
 *    Enforced HERE, on the server, not just by hiding it in the UI.
 *
 * Pure and import-free so the rule is directly testable.
 */

/**
 * The paid "cure" inside `result` (WP-1, brief oct-2026 §3). Until now
 * `top_fixes` (all of them) and `buyer_persona_response` reached a Free
 * viewer's browser in full and were only BLURRED by the UI — anyone with
 * DevTools read what a one-time unlock is meant to sell.
 *
 * Without the full report:
 *  • `top_fixes` — #1 stays whole (the free "aha"); #2+ keep only title /
 *    impact / effort and `locked: true` (same shape as `gateFixes` for Fix
 *    Tracks). Titles stay visible because knowing WHAT is locked is what makes
 *    the lock worth opening; `why` / `evidence` / `theme_slug` are the fix.
 *  • `annotations[].fix` — emptied + `fix_locked: true`; the pin, its position
 *    and the problem text (`message`) stay visible to everyone.
 *  • `buyer_persona_response` — `null` plus `persona_locked: true`; the UI
 *    blurs a static placeholder instead.
 *
 * Nothing stored changes — only what travels to the browser. Fails closed:
 * anything but `true` withholds.
 */
export function gateResult<R extends Record<string, unknown>>(
  result: R | null | undefined,
  hasFullReport: boolean,
): R | null | undefined {
  if (!result || hasFullReport === true) return result;
  const fixes = Array.isArray(result.top_fixes) ? (result.top_fixes as Array<Record<string, unknown>>) : null;
  return {
    ...result,
    ...(fixes
      ? {
          top_fixes: fixes.map((f, i) =>
            i === 0 ? f : { title: f?.title, impact: f?.impact, effort: f?.effort, locked: true },
          ),
        }
      : {}),
    // The marker, its position and the PROBLEM text (`message`) stay open;
    // the "how" (`fix`) is the paid part.
    ...(Array.isArray(result.annotations)
      ? {
          annotations: (result.annotations as Array<Record<string, unknown>>).map((a) =>
            a && typeof a === "object" ? { ...a, fix: "", fix_locked: true } : a,
          ),
        }
      : {}),
    buyer_persona_response: null,
    persona_locked: true,
  };
}

/** Row-level wrapper: applies `gateResult` to `row.result` when there is one. */
export function gateRowResult<T extends Record<string, unknown>>(row: T, hasFullReport: boolean): T {
  if (row.result == null || hasFullReport === true) return row;
  return { ...row, result: gateResult(row.result as Record<string, unknown>, hasFullReport) };
}

export function toClientAnalysis<T extends Record<string, unknown>>(
  row: T,
  viewer: { canSeeOptimizer: boolean; hasFullReport: boolean },
): Omit<T, "niche_winners" | "meta_ads" | "fix_tracks" | "rewrite"> & { meta_ads: unknown } {
  const { niche_winners: storedWinners, meta_ads: metaAds, fix_tracks: storedTracks, rewrite: storedRewrite, ...rest } = row;
  void storedRewrite; // legacy Scale column, never read by a client component
  void storedWinners; // withheld on purpose — see above
  void storedTracks; // Fix Tracks cache holds every generated fix IN FULL — only the gated route may serve it
  return {
    ...gateRowResult(rest, viewer.hasFullReport),
    meta_ads: viewer.canSeeOptimizer ? (metaAds ?? null) : null,
  } as never;
}

/**
 * Same rule for the polling endpoint. Fails closed: if the viewer's plan
 * couldn't be resolved, the column is withheld (the report page re-renders
 * with it once the run finishes).
 */
export function gateMetaAds<T extends Record<string, unknown>>(
  row: T,
  canSeeOptimizer: boolean,
): T & { meta_ads: unknown } {
  return { ...row, meta_ads: canSeeOptimizer ? (row.meta_ads ?? null) : null };
}
