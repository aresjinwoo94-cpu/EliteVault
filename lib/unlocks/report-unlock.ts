/**
 * Who may read the full report of ONE audit.
 *
 * The single decision point shared by the report page, the polling route and
 * every other path that serves an `analyses` row to a browser (brief oct-2026
 * §4.2). Pure on purpose: WP-2 will feed `unlocked` from the one-time unlock
 * table; until then it is always false and the rule reduces to "paid plan".
 */
export function hasFullReport(viewer: { plan: string | null | undefined; unlocked?: boolean }): boolean {
  return (viewer.plan != null && viewer.plan !== "free") || viewer.unlocked === true;
}
