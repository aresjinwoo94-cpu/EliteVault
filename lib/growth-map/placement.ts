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

  // Band the composite into the six ranks. Thresholds spread real stores across
  // the map (so "TU TIENDA" is NOT always at The Wall — spec §10 check).
  const rankIndex =
    composite < 30
      ? 0 // Copper / Foundation
      : composite < 48
        ? 1 // Steel / Traction (frequently just before The Wall)
        : composite < 64
          ? 2 // Silver / Optimization
          : composite < 79
            ? 3 // Gold / Scale
            : composite < 91
              ? 4 // Diamond / Authority
              : 5; // Ruby / Elite

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
