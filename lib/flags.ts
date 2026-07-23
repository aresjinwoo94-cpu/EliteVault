/**
 * Feature flags.
 *
 * Read from the environment at call time (not module load) so a hosting
 * platform can flip one and the next request picks it up without a rebuild —
 * the point of a flag is turning something off WITHOUT a deploy.
 */

function enabled(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return defaultOn;
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/**
 * "🔥 Winners in your niche" in the analyzer report (FASE B).
 *
 * DEFAULT OFF. The module is an enrichment layered on top of a Library that is
 * still being expanded and verified; until a niche reliably has 3 published,
 * live, signal-backed stores, showing it does more harm than good. Set
 * `ENABLE_NICHE_WINNERS=true` once `npm run library:audit` passes.
 *
 * Turning it off can never affect the audit itself — the analyzer page treats
 * the module as optional data (see lib/library/niche-winners.ts).
 */
export function nicheWinnersEnabled(): boolean {
  return enabled("ENABLE_NICHE_WINNERS", false);
}
