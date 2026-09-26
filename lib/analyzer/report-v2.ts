import type { AnalysisResult } from "@/lib/supabase/types";
import { computePlacement, RANKS } from "@/lib/growth-map/placement";

/**
 * analyzer-report-redesign brief §1 — the pure derivations behind the v2 report
 * (flag ANALYZER_REPORT_V2). Kept here, framework-free (no "use client", no
 * "server-only"), so the SAME functions feed the client hero/stepper AND the
 * server-rendered dashboard, and so they can be unit-tested without React.
 *
 * The golden rule (brief §A.3): NONE of this removes the score. The score is
 * still computed and still drives every dollar figure — these helpers only
 * decide WHAT WE SHOW instead of the raw 0–100:
 *   • potentialBandForResult → the aspirational $/mo band of the store's stage
 *     (the "$ potential", framed with the existing "not your revenue" caveat).
 *   • adReadinessWords       → the ad-readiness verdict as a WORD (never a
 *     number), plus the count of things standing in the way.
 */

export type AdReadinessVerdict = "ready" | "almost" | "not_ready";

/**
 * The $ potential band for a finished audit — e.g. "~$20k–80k/mo".
 *
 * Derived from the SAME deterministic placement the Growth Map used
 * (computePlacement → rank index → RANKS[i].band), so turning the flag on
 * doesn't invent a new number: it surfaces the band that was always the
 * store's stage, and hides the rank NAME + the 0–100 that sat next to it.
 *
 * The band is an orientative overlay, never a claim about the store's revenue
 * (see ranks.ts / report.potentialTitle copy). Returns null only when there's
 * no result to place.
 */
export function potentialBandForResult(
  result: AnalysisResult | null | undefined,
): string | null {
  if (!result) return null;
  const { rankIndex } = computePlacement(result);
  const idx = Math.max(0, Math.min(RANKS.length - 1, Math.round(rankIndex)));
  return RANKS[idx]?.band ?? null;
}

export interface AdReadinessWords {
  verdict: AdReadinessVerdict;
  /**
   * How many concrete things stand between this store and cold paid traffic.
   * Prefers the media-buyer blockers the model flagged; falls back to the
   * ranked fix count so a "not ready" verdict always has a number to name.
   * 0 is valid (a "ready" store with no blockers).
   */
  blockerCount: number;
}

/**
 * The ad-readiness verdict as WORDS (brief §A.4) — the hero leads with this
 * instead of any 0–100. Returns null when the audit predates the ad_readiness
 * field (old reports), so the caller can fall back to a scoreless generic.
 */
export function adReadinessWords(
  result: AnalysisResult | null | undefined,
): AdReadinessWords | null {
  const ar = result?.ad_readiness;
  const verdict = ar?.verdict;
  if (verdict !== "ready" && verdict !== "almost" && verdict !== "not_ready") {
    return null;
  }
  const blockers = (ar?.blockers ?? []).filter(
    (b) => b && typeof b.title === "string" && b.title.trim(),
  ).length;
  const fixes = (result?.top_fixes ?? []).filter(
    (f) => f && typeof f.title === "string" && f.title.trim(),
  ).length;
  // For "not ready"/"almost", name the media-buyer blockers if the model flagged
  // any, else fall back to the ranked fix count (there is always at least one
  // thing to do). For "ready", the honest count is whatever blockers remain
  // (usually 0) — never the fix count, which would invent urgency.
  const blockerCount =
    verdict === "ready" ? blockers : blockers > 0 ? blockers : fixes;
  return { verdict, blockerCount };
}

/** The six audit rubric dimensions, in a stable order. */
export type CategoryKey =
  | "cro_principles"
  | "niche_coherence"
  | "technical_optimization"
  | "layout_proportion"
  | "image_quality"
  | "color_integration";

const CATEGORY_KEYS: CategoryKey[] = [
  "cro_principles",
  "niche_coherence",
  "technical_optimization",
  "layout_proportion",
  "image_quality",
  "color_integration",
];

/** Normalize a possibly-0..1 category score to 0..100. */
function norm100(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n > 1 ? n : n * 100));
}

export interface PotentialWhy {
  /** The lowest-scoring rubric dimension — where cold traffic leaks. Null when
   *  the audit carries no category_scores. */
  weakestCategoryKey: CategoryKey | null;
  /** How many ranked fixes ("leaks") the report lists below. */
  leakCount: number;
}

/**
 * The inputs for the hero's "Why this potential" bullets (hero refinement) —
 * DERIVED IN CODE from data the audit ALREADY produced (category_scores +
 * top_fixes). No new AI call, nothing on the critical path; the caller turns
 * these into plain-language, localized bullets. Pure + exported for tests.
 */
export function potentialWhy(
  result: AnalysisResult | null | undefined,
): PotentialWhy {
  const cats = result?.category_scores as
    | Record<string, number>
    | undefined
    | null;
  let weakest: { key: CategoryKey; v: number } | null = null;
  if (cats) {
    for (const k of CATEGORY_KEYS) {
      // Skip a dimension the audit didn't actually score — a present-but-empty
      // category_scores would otherwise report a false "weakest" at 0. (A real
      // succeeded audit carries all six, so this only guards malformed data.)
      const raw = cats[k];
      if (raw === undefined || raw === null) continue;
      const v = norm100(raw);
      if (!weakest || v < weakest.v) weakest = { key: k, v };
    }
  }
  const leakCount = (result?.top_fixes ?? []).filter(
    (f) => f && typeof f.title === "string" && f.title.trim(),
  ).length;
  return { weakestCategoryKey: weakest?.key ?? null, leakCount };
}
