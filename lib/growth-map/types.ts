import type { RankKey } from "./ranks";

/**
 * Shared types for the Growth Map (spec §5/§6). Kept dependency-free so the
 * client SVG, the API route and the feedback agent all agree on one shape.
 */

/** Where a store lands on the map — computed deterministically from findings. */
export interface GrowthMapPlacement {
  /** The rank the store currently sits on. */
  rankKey: RankKey;
  /** 0-based index of that rank (mirror of rankKey for convenience). */
  rankIndex: number;
  /** True when the store is on the last rank before The Wall (Steel) — drives
   *  the "one step from The Wall" hook. */
  atWallEdge: boolean;
  /**
   * Compact, human-readable signals that JUSTIFY the placement, derived from
   * the store's own findings (score + category scores + top fixes). Passed to
   * the AI so its node copy references the SAME evidence, and shown as the
   * deterministic scaffold when the AI is unavailable.
   */
  signals: string[];
}

/** One node's AI micro-feedback (spec §5). */
export interface NodeFeedback {
  rankKey: RankKey;
  /** current = diagnosis · past = what they nailed · next = locked teaser. */
  role: "past" | "current" | "next";
  /**
   * 1-2 sentence, store-specific line. For a Free viewer's `next` node this is
   * a NON-specific teaser (nothing real to leak) and `locked` is true.
   */
  text: string;
  /** True when the real content is withheld behind the Pro gate. */
  locked: boolean;
}

/** The full payload cached on analyses.growth_map and returned by the API. */
export interface GrowthMapData {
  version: number;
  placement: GrowthMapPlacement;
  /** Keyed by rank index (0-5). Missing entries render deterministic scaffold. */
  nodes: NodeFeedback[];
  /** 3-5 line diagnosis for the current rank (spec §9). */
  diagnosis: string;
  /** Which engine produced the copy: "ai" or "scaffold" (fallback). */
  source: "ai" | "scaffold";
  /** Resolved niche label for display + phrase-bank tone (e.g. "Skincare"). */
  nicheLabel: string;
  generatedAt: string;
}

/** Current schema version — bump to invalidate stale cached payloads. */
export const GROWTH_MAP_VERSION = 1;
