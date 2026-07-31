import type { GrowthMapData } from "./types";

/**
 * Apply Free/Pro gating at read time (spec §7). Pure (no server imports) so it's
 * unit-testable and safe to import anywhere.
 *
 * Free sees the full map, their rank, and the current-node diagnosis; every node
 * AHEAD (the exact escape route) is locked — the client blurs its text behind
 * the Pro hook, so the value is visible but the answer isn't.
 */
export function gateForViewer(
  data: GrowthMapData,
  isPaid: boolean,
): GrowthMapData {
  if (isPaid) return data;
  return {
    ...data,
    nodes: data.nodes.map((n) =>
      n.role === "next" ? { ...n, locked: true } : n,
    ),
  };
}
