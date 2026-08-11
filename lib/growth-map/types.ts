import type { RankKey } from "./ranks";
import type { IssueDiff } from "@/lib/analyzer/link-issues";

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

/**
 * Intra-stage progress toward the next rank (brief A3). Pure, zero-latency and
 * client-rendered — drives the "72% of the way to Silver / X from Steel" bar so
 * a store's improvement is visible even before it crosses a rank (indispensable
 * while most stores live in the wide Steel band).
 */
export interface RankProgress {
  /** 0..1 progress through the current band toward its upper edge. */
  pct: number;
  /** Composite points left to cross into the next rank (0 once at/over the edge). */
  toNextEdge: number;
  /** The rank the store is climbing toward; null at the top rank (Ruby). */
  nextRankKey: RankKey | null;
}

/**
 * The projected "potential" node (brief §1.1) — "here's where these fixes take
 * you". Derived DETERMINISTICALLY from the report's own top-fix impacts, capped
 * at one rank of advance for realism. No API, no latency. Present on the payload
 * only when the potential flag is on.
 */
export interface GrowthMapProjection {
  /** Projected composite (0..100) after the report's top fixes. */
  composite: number;
  /** Rank index of the projected node (≤ current + 1). */
  rankIndex: number;
  rankKey: RankKey;
  /** True when the projected rank is genuinely above the current rank. */
  advances: boolean;
  /** Titles of the fixes that drive the lift (≤3) — labels the current→ghost gap. */
  liftFixes: string[];
}

/**
 * Movement vs the previous run for the same domain (brief §1.2). Present on the
 * payload only when the history flag is on AND a prior run exists.
 */
export interface GrowthMapMovement {
  previousComposite: number;
  currentComposite: number;
  previousRankIndex: number;
  currentRankIndex: number;
  /** ISO timestamp of the previous run. */
  previousAt: string;
  /** True when the store crossed The Wall since the previous run. */
  crossedWall: boolean;
  /**
   * A4 hysteresis: true only when the composite moved beyond single-run vision
   * noise (±3–4 pts). When false, a rank/Wall change is within noise and the UI
   * must show intra-stage progress instead of narrating "advanced / crossed" —
   * this is what kills the "you went up… no, down" flip-flop between runs.
   */
  rankMoveConfident: boolean;
  /**
   * Issue-level diff vs the previous run (master brief §D) — the PROTAGONIST of
   * the "what changed" story; the stage move is the secondary line. Present only
   * when the issue-diff flag is on AND the previous run persisted snapshots.
   */
  issueDelta?: IssueDiff;
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
  /**
   * Projected "potential" node (brief §1.1). Decorated onto the payload only
   * when the potential flag is on; absent otherwise so the map stays unchanged.
   */
  projection?: GrowthMapProjection;
  /**
   * Movement vs the previous run for this domain (brief §1.2). Present only when
   * the history flag is on and a prior run exists.
   */
  movement?: GrowthMapMovement;
  generatedAt: string;
}

/** Current schema version — bump to invalidate stale cached payloads. */
export const GROWTH_MAP_VERSION = 1;
