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
 *  • `fix_tracks` — the Fix Tracks cache: full text of every generated track
 *    (including fixes #2+ a free viewer must not read). Served ONLY by
 *    /api/analyses/[id]/fix-tracks/[track], which gates per viewer. The page
 *    passes just the free choice (a track id) separately.
 *  • `meta_ads` — the Meta Ads Optimizer output. The Meta run writes it for
 *    Pro and Scale (inngest/functions/run-meta-simulation.ts bundles it into
 *    Pro's run) and the report renders it only inside the block for viewers
 *    who can run Meta. So it reaches exactly those viewers — the report's
 *    behaviour is unchanged — and nobody else: an anonymous or Free viewer,
 *    or a paid user who downgraded to Free (the row keeps the column).
 *
 * Pure and import-free so the rule is directly testable.
 */

export function toClientAnalysis<T extends Record<string, unknown>>(
  row: T,
  viewer: { canRunMeta: boolean },
): Omit<T, "niche_winners" | "meta_ads" | "fix_tracks"> & { meta_ads: unknown } {
  const { niche_winners: storedWinners, meta_ads: metaAds, fix_tracks: storedTracks, ...rest } = row;
  void storedWinners; // withheld on purpose — see above
  void storedTracks; // Fix Tracks cache holds every generated fix IN FULL — only the gated route may serve it
  return { ...rest, meta_ads: viewer.canRunMeta ? (metaAds ?? null) : null };
}

/**
 * Same rule for the polling endpoint. Fails closed: if the viewer's plan
 * couldn't be resolved, the column is withheld (the report page re-renders
 * with it once the run finishes).
 */
export function gateMetaAds<T extends Record<string, unknown>>(
  row: T,
  canRunMeta: boolean,
): T & { meta_ads: unknown } {
  return { ...row, meta_ads: canRunMeta ? (row.meta_ads ?? null) : null };
}
