/**
 * EliteVault Growth Map — the six rank-materials.
 *
 * This is the DETERMINISTIC visual template (spec §2/§6): a fixed, vectorial,
 * premium artifact. The AI never draws it — it only picks WHICH rank a store
 * lands on and writes the per-node feedback. Keeping the geometry + identity
 * here (pure data, no `server-only`) lets both the client SVG and the
 * server-side feedback agent share one source of truth.
 *
 * Stage anchoring (spec §3): the qualitative stages come from Churchill &
 * Lewis, "The Five Stages of Small Business Growth" (HBR 1983). The $ bands are
 * EliteVault's own ORIENTATIVE overlay — approximate ranges, not law — and are
 * labelled that way in the UI. We never claim a store's revenue from a
 * screenshot.
 */

export type RankKey =
  | "copper"
  | "steel"
  | "silver"
  | "gold"
  | "diamond"
  | "ruby";

export interface Rank {
  /** 0-based index along the path. */
  index: number;
  key: RankKey;
  /** Material name shown ABOVE the medallion (spec §2). */
  material: string;
  /** Stage name shown BELOW the medallion. */
  stage: string;
  /** Churchill & Lewis (HBR 1983) equivalent — used in copy/tooltips. */
  churchill: string;
  /** Hex identity colour for the medallion + ring. */
  color: string;
  /** Representative object (emoji) inside the medallion. */
  icon: string;
  /** Orientative $ band label (EliteVault overlay, not a claim). Kept as-is: AI copy and old reads use it. */
  band: string;
  /** The same band as numbers (USD), so the UI can show it in the visitor's currency. */
  bandUsd: BandUsd;
}

/** `max: null` = open-ended ("$1M+"); `min = max = 0` = "$0 – first sales". */
export interface BandUsd {
  min: number;
  max: number | null;
  perMonth: boolean;
}

export const RANKS: Rank[] = [
  {
    index: 0,
    key: "copper",
    material: "Copper",
    stage: "Foundation",
    churchill: "Existence",
    color: "#B87333",
    icon: "🪙",
    band: "$0 – first sales",
    bandUsd: { min: 0, max: 0, perMonth: false },
  },
  {
    index: 1,
    key: "steel",
    material: "Steel",
    stage: "Traction",
    churchill: "Survival",
    color: "#9AA6B4",
    icon: "🔨",
    band: "~$1k–8k/mo",
    bandUsd: { min: 1_000, max: 8_000, perMonth: true },
  },
  {
    index: 2,
    key: "silver",
    material: "Silver",
    stage: "Optimization",
    churchill: "Success",
    color: "#CBD5E1",
    icon: "🛡️",
    band: "~$20k–80k/mo",
    bandUsd: { min: 20_000, max: 80_000, perMonth: true },
  },
  {
    index: 3,
    key: "gold",
    material: "Gold",
    stage: "Scale",
    churchill: "Take-off",
    color: "#E8B84B",
    icon: "🧱",
    band: "~$80k–250k/mo",
    bandUsd: { min: 80_000, max: 250_000, perMonth: true },
  },
  {
    index: 4,
    key: "diamond",
    material: "Diamond",
    stage: "Authority",
    churchill: "Resource Maturity",
    color: "#8EE3F5",
    icon: "💎",
    band: "~$250k–1M/mo",
    bandUsd: { min: 250_000, max: 1_000_000, perMonth: true },
  },
  {
    index: 5,
    key: "ruby",
    material: "Ruby",
    stage: "Elite",
    churchill: "Market leadership",
    color: "#E0405E",
    icon: "🔺",
    band: "$1M+/mo",
    bandUsd: { min: 1_000_000, max: null, perMonth: true },
  },
];

/** The Wall — the danger zone (spec §2/§3). It sits BETWEEN Steel and Silver. */
export const WALL_AFTER_INDEX = 1; // danger zone lives after Steel (index 1)

export function rankByKey(key: RankKey): Rank {
  return RANKS.find((r) => r.key === key) ?? RANKS[0];
}

export function rankByIndex(index: number): Rank {
  const clamped = Math.max(0, Math.min(RANKS.length - 1, Math.round(index)));
  return RANKS[clamped];
}
