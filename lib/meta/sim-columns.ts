/** Columns of a meta_simulations row the client may read (never user_id / inngest_run_id). */
export const SIM_COLUMNS =
  "id, analysis_id, aov_usd, daily_budget_usd, product_margin_pct, notes, conservative, balanced, aggressive, status, error, started_at, finished_at, created_at";

/** Same + how the numbers are displayed (migration 0048). */
export const SIM_COLUMNS_WITH_DISPLAY = `${SIM_COLUMNS}, display_currency, display_fx_rate`;

/**
 * Runs a query with the display columns and, if the database does not have
 * them yet (code deployed before migration 0048 is applied), runs it again
 * without — so a missing column degrades to USD display, never to "no simulation".
 */
export async function withDisplayColumns<T>(run: (columns: string) => PromiseLike<T>): Promise<T> {
  const res = await run(SIM_COLUMNS_WITH_DISPLAY);
  const message = (res as { error?: { message?: string } | null } | null)?.error?.message ?? "";
  if (/display_(currency|fx_rate)/.test(message)) return run(SIM_COLUMNS);
  return res;
}
