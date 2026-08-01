import type { AnalysisResult } from "@/lib/supabase/types";
import { RANKS, WALL_AFTER_INDEX, rankByIndex } from "./ranks";
import type { GrowthMapPlacement } from "./types";

/**
 * Deterministic placement (spec §4/§6).
 *
 * The AI does NOT pick the rank — a store's position is a pure function of ITS
 * OWN structured findings, which is precisely why two different stores land in
 * different places (spec §0: "cero resultados idénticos"). Deterministic also
 * means it's free, instant, cacheable and can't hallucinate a revenue number
 * off a screenshot (spec §3/§4).
 *
 * Composite = the overall score, nudged by the CRO/offer-clarity signals that
 * the stage model actually cares about (Churchill & Lewis: can the visitor tell
 * what you sell, and does the funnel hold together?). Category scores break ties
 * so equal-score stores don't collapse onto the same rank.
 */

const CATS = [
  "cro_principles",
  "niche_coherence",
  "technical_optimization",
  "layout_proportion",
  "image_quality",
  "color_integration",
] as const;

const CAT_LABELS: Record<(typeof CATS)[number], string> = {
  cro_principles: "conversion fundamentals",
  niche_coherence: "offer clarity",
  technical_optimization: "technical health",
  layout_proportion: "layout & hierarchy",
  image_quality: "imagery",
  color_integration: "visual cohesion",
};

/** Normalize a possibly-0..1 score to 0..100 (the analyzer sometimes emits 0..1). */
function norm100(v: number | undefined | null): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  const scaled = n > 1 ? n : n * 100;
  return Math.max(0, Math.min(100, scaled));
}

export function computePlacement(result: AnalysisResult): GrowthMapPlacement {
  const score = norm100(result.score);
  const cats = result.category_scores;

  // Offer clarity + conversion fundamentals decide whether a store can even
  // survive its own traffic — weight them alongside the headline score.
  const offer = norm100(cats?.niche_coherence);
  const cro = norm100(cats?.cro_principles);
  const composite = Math.round(score * 0.6 + cro * 0.22 + offer * 0.18);

  // Band the composite into the six ranks.
  //
  // Calibration (tech-fixes §6): the old bands were too generous — an "average"
  // store (~58 composite with real leaks) sailed into Silver/Optimization,
  // PAST The Wall, which is exactly where the hook goes soft. The Wall sits
  // right after Steel (WALL_AFTER_INDEX), so the fix is to keep average stores
  // AT Steel: the whole 40–70 band now lands there (Steel proper 40–58, then
  // the 58–70 "stuck at the wall" zone). A store only escapes to Silver once
  // it's genuinely past average (70+). Genuinely good stores still climb, so
  // "TU TIENDA" is NOT always at The Wall — but most average ones now feel it.
  let rankIndex =
    composite < 40
      ? 0 // Copper / Foundation      (<40)
      : composite < 70
        ? 1 // Steel / Traction        (40–70, includes The Wall zone)
        : composite < 82
          ? 2 // Silver / Optimization  (70–82)
          : composite < 90
            ? 3 // Gold / Scale          (82–90)
            : composite < 96
              ? 4 // Diamond / Authority (90–96)
              : 5; // Ruby / Elite       (96+)

  // Findings-based demotion (tech-fixes §6): the number alone can flatter a
  // store that photographs well but leaks conversion. A store with critical
  // conversion/offer leaks belongs AT OR BEFORE The Wall (index ≤ 1) even when
  // its composite would place it higher — that tension is the honest read and
  // where the urgency lives. We never PROMOTE on findings, only hold back.
  const worstCat = Math.min(
    ...CATS.map((k) => norm100(cats?.[k])),
  );
  const hasCriticalLeak =
    offer < 55 || // shopper can't tell what you sell in <2s
    cro < 55 || // clear funnel leaks
    worstCat < 48 || // at least one badly broken dimension (e.g. sterile imagery)
    result.ad_readiness?.verdict === "not_ready";
  if (hasCriticalLeak && rankIndex > WALL_AFTER_INDEX) {
    rankIndex = WALL_AFTER_INDEX; // hold at Steel — at the edge of The Wall
  }

  const rank = rankByIndex(rankIndex);

  // ── Evidence signals (spec §5) — the store's own findings, ranked worst-first
  // so the AI + the scaffold both anchor on the real leaks.
  const signals: string[] = [];

  if (offer < 55) {
    signals.push("Offer isn't legible in <2s (low niche coherence)");
  }
  if (cro < 55) {
    signals.push("Clear CRO leaks in the funnel");
  }

  // Name the two weakest categories as concrete leaks.
  const ranked = CATS.map((k) => ({ k, v: norm100(cats?.[k]) })).sort(
    (a, b) => a.v - b.v,
  );
  for (const { k, v } of ranked.slice(0, 2)) {
    if (v < 65) signals.push(`Weak ${CAT_LABELS[k]} (${Math.round(v)}/100)`);
  }

  // Ad-readiness verdict, when present, is exactly the media-buyer read.
  const verdict = result.ad_readiness?.verdict;
  if (verdict === "not_ready") signals.push("Not ready for cold paid traffic");
  else if (verdict === "almost") signals.push("Almost ad-ready — blockers remain");
  else if (verdict === "ready") signals.push("Fundamentals hold for paid traffic");

  // The single highest-impact fix names the lever.
  const topFix = result.top_fixes?.[0]?.title;
  if (topFix) signals.push(`Top lever: ${topFix}`);

  // Strengths, for the "what you already nailed" past-node copy.
  const strongest = [...ranked].reverse()[0];
  if (strongest && strongest.v >= 70) {
    signals.push(`Strength: ${CAT_LABELS[strongest.k]} (${Math.round(strongest.v)}/100)`);
  }

  return {
    rankKey: rank.key,
    rankIndex: rank.index,
    atWallEdge: rank.index === WALL_AFTER_INDEX,
    signals: signals.slice(0, 6),
  };
}

/** Human sentence describing the placement band (used in fallbacks). */
export function placementBandLabel(rankIndex: number): string {
  const r = rankByIndex(rankIndex);
  return `${r.material} · ${r.stage}`;
}

export { RANKS };
