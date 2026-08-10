import type { AnalysisResult } from "@/lib/supabase/types";

/**
 * Brief §1 — derive the ONE hero score in code from the six category scores.
 *
 * The model used to emit `score` INDEPENDENTLY of `category_scores`, so the
 * headline number (e.g. 62) never matched the visible average of the six
 * categories (~67) and the report read as two unrelated systems. We now stop
 * asking the model for `score` at all (it's out of ANALYSIS_TOOL_SCHEMA — which
 * also shrinks the model's output, the pipeline's binding constraint) and
 * compute the overall as a documented weighted mean of the categories.
 *
 * Weights are paid-traffic-oriented: conversion fundamentals and layout carry
 * the most, pure aesthetics the least. They sum to exactly 1.0 so the result is
 * a true weighted average on the same 0..100 scale as each category.
 *
 * IMPORTANT (surgical): everything downstream — placement.compositeOf, the
 * Growth Map hero, the free ROAS panel — keeps reading `result.score`. We only
 * change WHO writes it (code, at persistence) not who reads it. See
 * inngest/functions/analyze-website.ts.
 */
export const SCORE_WEIGHTS: Record<
  keyof AnalysisResult["category_scores"],
  number
> = {
  cro_principles: 0.28,
  layout_proportion: 0.2,
  image_quality: 0.16,
  technical_optimization: 0.14,
  niche_coherence: 0.12,
  color_integration: 0.1,
};

/** Normalize a possibly-0..1 category value to 0..100 and clamp. */
function norm100(v: number | undefined | null): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  const scaled = n > 1 ? n : n * 100;
  return Math.max(0, Math.min(100, scaled));
}

/**
 * The weighted overall score (0..100, rounded) from the category breakdown.
 *
 * Returns `null` when the categories are missing or all zero — the signal to
 * the caller that there's nothing to derive from, so an OLD analysis (stored
 * before this change, with a real model score but possibly inconsistent
 * categories) keeps its saved score rather than being flattened to 0.
 */
export function deriveOverallScore(
  categories: AnalysisResult["category_scores"] | null | undefined,
): number | null {
  if (!categories || typeof categories !== "object") return null;

  let sum = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS) as [
    keyof AnalysisResult["category_scores"],
    number,
  ][]) {
    const v = norm100(categories[key]);
    sum += v * weight;
    total += weight;
  }
  if (total === 0) return null;
  const score = Math.round(sum / total);
  // All-zero categories → nothing meaningful to derive; let the caller fall back.
  if (score <= 0) return null;
  return score;
}

/**
 * The minimal shape withDerivedScore needs. Kept structural (not the full
 * AnalysisResult) so it accepts BOTH the ai/schemas z.infer type — where the
 * model now omits `score` — and the supabase read type, without a cross-type
 * cast at the call site.
 */
type Scoreable = {
  category_scores: AnalysisResult["category_scores"];
  score?: number;
};

/**
 * Return a copy of the result with `score` reconciled to the category
 * breakdown and stamped `schema_version: 2`. Falls back to the existing score
 * when the categories can't produce one (old/degenerate data).
 */
export function withDerivedScore<T extends Scoreable>(
  result: T,
): T & { score: number; schema_version: number } {
  const derived = deriveOverallScore(result.category_scores);
  return {
    ...result,
    score: derived ?? result.score ?? 0,
    schema_version: 2,
  };
}
