import { RANKS, rankByIndex, type RankKey } from "./ranks";
import type { GrowthMapPlacement, NodeFeedback } from "./types";

/**
 * Phrase bank (spec §6) — pre-written, in EliteVault's voice (direct, no
 * fluff). This is TONE SCAFFOLDING and the HONEST FALLBACK: when the AI is
 * unavailable or its output is too generic to trust, we render copy built from
 * the store's REAL deterministic signals + its niche + its rank. We never
 * invent a fake "concrete store detail" here (spec §5: don't show an invented
 * phrase) — the specificity comes only from evidence we actually computed.
 */

/** Per-rank tone for the CURRENT-node diagnosis (why they're here). */
const CURRENT_LEAD: Record<RankKey, string> = {
  copper:
    "You're at the Foundation. The basics aren't landing yet — a visitor can't tell what you sell or why to trust it.",
  steel:
    "You're at Traction. The fundamentals work, but leaks are bleeding conversions right before The Wall.",
  silver:
    "You're at Optimization. Solid base, real structure — now it's about squeezing the funnel, not rebuilding it.",
  gold:
    "You're at Scale. This store is polished; the gains left are in systems and paid efficiency, not fixes.",
  diamond:
    "You're at Authority. Brand-mature signals throughout — you're playing a different game now.",
  ruby: "You're at Elite. Category-leader territory — the map is behind you.",
};

/** Per-rank teaser for the NEXT node (locked for Free). */
const NEXT_TEASER: Record<RankKey, string> = {
  copper: "Reach Traction: make the offer legible in 2 seconds and earn first trust.",
  steel: "Cross The Wall into Optimization: close the CRO leaks 87% of stores never fix.",
  silver: "Reach Scale: turn a converting store into a paid-traffic machine.",
  gold: "Reach Authority: brand gravity that lowers CAC on its own.",
  diamond: "Reach Elite: market leadership and defensible moat.",
  ruby: "You're already at the top rank.",
};

/** Per-rank reinforcement for PAST nodes (what they cleared). */
const PAST_NOTE: Record<RankKey, string> = {
  copper: "Foundation cleared — the store exists and takes orders.",
  steel: "Traction cleared — you have a working funnel.",
  silver: "Optimization cleared — the funnel converts.",
  gold: "Scale cleared — the store runs like a system.",
  diamond: "Authority cleared — the brand carries weight.",
  ruby: "Elite cleared.",
};

function nicheClause(nicheLabel: string): string {
  const n = nicheLabel.trim();
  if (!n || n.toLowerCase() === "ecommerce") return "";
  return ` In ${n}, that's usually the difference between a browse and a buy.`;
}

/** Build the 3-5 line diagnosis for the current rank from real signals. */
export function scaffoldDiagnosis(
  placement: GrowthMapPlacement,
  nicheLabel: string,
): string {
  const rank = rankByIndex(placement.rankIndex);
  const lead = CURRENT_LEAD[rank.key];
  const evidence = placement.signals.slice(0, 2);
  const evidenceLine = evidence.length
    ? ` What we see: ${evidence.join("; ").toLowerCase()}.`
    : "";
  const wall =
    placement.atWallEdge
      ? " You're one step from The Wall, where HBR found ~87% of companies stall."
      : "";
  return `${lead}${evidenceLine}${nicheClause(nicheLabel)}${wall}`.trim();
}

/** Build a full node-feedback set (deterministic fallback for all six ranks). */
export function scaffoldNodes(
  placement: GrowthMapPlacement,
  nicheLabel: string,
  opts: { lockNext: boolean },
): NodeFeedback[] {
  const current = placement.rankIndex;
  return RANKS.map((rank): NodeFeedback => {
    if (rank.index < current) {
      return {
        rankKey: rank.key,
        role: "past",
        text: PAST_NOTE[rank.key],
        locked: false,
      };
    }
    if (rank.index === current) {
      return {
        rankKey: rank.key,
        role: "current",
        text: scaffoldDiagnosis(placement, nicheLabel),
        locked: false,
      };
    }
    // Ahead of the store. The immediate next node is the hook; further nodes
    // stay teasers. For Free, the next node is locked (spec §7).
    const isImmediateNext = rank.index === current + 1;
    return {
      rankKey: rank.key,
      role: "next",
      text: NEXT_TEASER[rank.key],
      locked: opts.lockNext && isImmediateNext,
    };
  });
}
