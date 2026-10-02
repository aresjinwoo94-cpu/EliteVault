/**
 * The analyzer's global concurrency, clamped to the Inngest PLAN's ceiling
 * (free plan = 5).
 *
 * Measured 2026-10-01: ANALYZER_CONCURRENCY=8 made Inngest REJECT every sync
 * (`PUT /api/inngest` → "The function 'Analyze website' has higher concurrency
 * limits (8) than your plan limit of 5", modified:false). Nothing in Vercel
 * shows that rejection, so Inngest kept calling the last deploy that DID
 * register — 2026-09-03 — and a month of pipeline fixes never ran in
 * production. A value above the plan now runs at the plan's limit instead of
 * silently breaking every deploy's sync.
 *
 * Raise INNGEST_PLAN_CONCURRENCY_MAX only after upgrading the Inngest plan.
 */
export function resolveAnalyzerConcurrency(
  raw: string | undefined,
  planMaxRaw: string | undefined,
): number {
  const p = Number(planMaxRaw);
  const planMax = Number.isFinite(p) && p >= 1 ? Math.round(p) : 5;
  const n = Number(raw);
  const wanted = Number.isFinite(n) && n > 0 ? Math.round(n) : 5;
  return Math.min(wanted, planMax);
}
