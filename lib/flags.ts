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

/**
 * The instant "teaser" score (P1.2) shown while the full audit runs.
 *
 * DEFAULT OFF. It's a nice-to-have that costs a SECOND AI request per audit —
 * on Gemini's free tier (15 requests/min PER KEY) that doubles the rate-limit
 * pressure, and a rate-limited key waits out a ~65s cooldown that can't fit
 * Vercel Hobby's 60s step ceiling, so the whole audit times out and refunds.
 * With one API key, halving the calls per audit is the difference between an
 * audit that completes and one that refunds. Turn it back on with
 * ANALYZER_QUICK_SCORE=true once the key pool (GEMINI_API_KEY_2..10) or a paid
 * tier gives enough RPM headroom.
 */
export function quickScoreEnabled(): boolean {
  return enabled("ANALYZER_QUICK_SCORE", false);
}

/**
 * Growth Map "potential" ghost node (brief §1.1).
 *
 * DEFAULT OFF. Renders a projected medallion — "here's where these fixes take
 * you" — derived DETERMINISTICALLY from the report's own top-fix impacts (no
 * API, no latency). Off until §7 acceptance passes so the projection copy and
 * the one-rank realism cap can be verified against real audits first.
 */
export function growthMapPotentialEnabled(): boolean {
  return enabled("GROWTH_MAP_POTENTIAL", false);
}

/**
 * Growth Map re-run movement (brief §1.2).
 *
 * DEFAULT OFF. Persists a lightweight placement point per normalized domain and,
 * on a later run, shows the delta ("48 → 57 · crossed The Wall"). Requires the
 * growth_map_history table (migration 0024). Off until that table is applied and
 * the movement copy is verified in both locales.
 */
export function growthMapHistoryEnabled(): boolean {
  return enabled("GROWTH_MAP_HISTORY", false);
}

/**
 * Growth Map issue diff across runs (master brief §D).
 *
 * DEFAULT OFF. When ON — and the previous run for this domain persisted issue
 * snapshots — the map opens the return visit with "what changed since {date}":
 * resolved issues (with the stage they unlock), newly introduced ones, and the
 * stage move as a secondary line. Requires growth_map_history.issues (migration
 * 0025) and GROWTH_MAP_HISTORY on (so points accumulate). OFF ⇒ current
 * behavior, byte-identical. Pure/deterministic: 0 tokens, no AI, no latency.
 */
export function growthMapIssueDiffEnabled(): boolean {
  return enabled("GROWTH_MAP_ISSUE_DIFF", false);
}

/**
 * Analyzer niche grounding (brief §2.3).
 *
 * DEFAULT OFF. Feeds the scoring pass a few precomputed `winning_sites` rows as
 * SOFT PRIORS (always labelled ai_estimate, anchored on the real
 * active_ads_count + niche demand). It's a Supabase read, not a third-party
 * call, so it fits the zero-third-party-call request rule — but stays off until
 * the added read is proven not to regress analyzer p95 (§7).
 */
export function analyzerGroundingEnabled(): boolean {
  return enabled("ANALYZER_NICHE_GROUNDING", false);
}
