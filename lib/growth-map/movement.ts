import { WALL_AFTER_INDEX } from "./ranks";

/**
 * Movement-layer helpers (master brief §A4) — pure and dependency-light so they
 * unit-test without the DB. Deliberately NOT in placement.ts: placement stays a
 * pure per-run function; hysteresis is a BETWEEN-runs concern that only exists
 * when we compare two placement points.
 */

/**
 * A4 hysteresis margin. A single vision audit varies ±3–4 pts between runs on an
 * unchanged store, so a rank/Wall change is only "real" once the composite has
 * moved at least this much. Within the margin the UI shows intra-stage progress
 * instead of narrating "advanced / crossed" — which is what stops the return
 * visit from reading "you went up… no, down" and destroying trust.
 */
export const HYSTERESIS_MARGIN = 3;

/**
 * True only when a rank change is beyond single-run noise: the rank index
 * actually changed AND the composite moved at least HYSTERESIS_MARGIN. A rank
 * that "changed" while the composite barely moved is noise, not progress.
 */
export function isRankMoveConfident(
  prevComposite: number,
  currComposite: number,
  prevRankIndex: number,
  currRankIndex: number,
): boolean {
  return (
    prevRankIndex !== currRankIndex &&
    Math.abs(currComposite - prevComposite) >= HYSTERESIS_MARGIN
  );
}

/** Did the store cross The Wall (Steel → Silver+) since the previous run? */
export function crossedWall(
  prevRankIndex: number,
  currRankIndex: number,
): boolean {
  return prevRankIndex <= WALL_AFTER_INDEX && currRankIndex > WALL_AFTER_INDEX;
}
