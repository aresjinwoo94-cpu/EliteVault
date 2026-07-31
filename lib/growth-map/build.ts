import "server-only";
import type { AnalysisResult } from "@/lib/supabase/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveNicheLabel } from "@/lib/growth-map/niche";
import { runGrowthMapFeedback } from "@/ai/agents/growth-map-feedback-agent";
import { computePlacement } from "./placement";
import { scaffoldNodes, scaffoldDiagnosis } from "./phrase-bank";
import { RANKS } from "./ranks";
import {
  GROWTH_MAP_VERSION,
  type GrowthMapData,
  type NodeFeedback,
} from "./types";

/**
 * Assemble (and cache) the Growth Map payload for one analysis (spec §6/§10.1).
 *
 * Deterministic placement is instant; the ONE AI call fills the store-specific
 * copy and, if it's unavailable or too generic, we fall back to the honest
 * scaffold (real signals, no invented details). The full UNGATED payload is
 * cached on analyses.growth_map so we never regenerate on a revisit (spec §5)
 * and an upgrade reveals the already-computed copy instantly. Free/Pro gating
 * is applied at READ time (see gateForViewer), not baked into the cache.
 */

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function nicheLabelFor(url: string | null, summary: string | null): string {
  return resolveNicheLabel({ url, summary });
}

/** Build fresh (no cache read). Used when the cache is empty or stale. */
export async function buildGrowthMap(input: {
  result: AnalysisResult;
  url: string | null;
}): Promise<GrowthMapData> {
  const { result, url } = input;
  const placement = computePlacement(result);
  const nicheLabel = nicheLabelFor(url, result.summary ?? null);
  const domain = domainOf(url);

  // Deterministic scaffold first — it's the guaranteed floor.
  const scaffold = scaffoldNodes(placement, nicheLabel, { lockNext: false });
  let nodes: NodeFeedback[] = scaffold;
  let diagnosis = scaffoldDiagnosis(placement, nicheLabel);
  let source: GrowthMapData["source"] = "scaffold";

  // One AI call for store-specific copy (best-effort). Cap it so it can't hang
  // a request — the scaffold already covers us.
  const ai = await runGrowthMapFeedback({
    result,
    placement,
    domain,
    nicheLabel,
    deadlineAt: Date.now() + 15_000,
  });

  if (ai) {
    source = "ai";
    diagnosis = ai.diagnosis || diagnosis;
    // Merge AI copy onto the scaffold: AI owns current + immediate-next + the
    // most-recent past note; other ranks keep their deterministic scaffold.
    const current = placement.rankIndex;
    nodes = RANKS.map((rank, i): NodeFeedback => {
      const base = scaffold[i];
      if (rank.index === current) {
        return { ...base, text: ai.currentNode || base.text };
      }
      if (rank.index === current - 1) {
        return { ...base, text: ai.pastNote || base.text };
      }
      if (rank.index === current + 1) {
        return { ...base, text: ai.nextTeaser || base.text };
      }
      return base;
    });
  }

  return {
    version: GROWTH_MAP_VERSION,
    placement,
    nodes,
    diagnosis,
    source,
    nicheLabel,
    generatedAt: new Date().toISOString(),
  };
}

/** Type guard: is a cached blob a current-version GrowthMapData? */
export function isFreshCache(blob: unknown): blob is GrowthMapData {
  return (
    !!blob &&
    typeof blob === "object" &&
    (blob as GrowthMapData).version === GROWTH_MAP_VERSION &&
    Array.isArray((blob as GrowthMapData).nodes)
  );
}

/**
 * Get-or-build with persistence. Reads the cache; on miss, builds and writes it
 * back via the service-role client (the owner's RLS also permits the update,
 * but the route may run before the session write settles — service role is the
 * reliable writer, exactly as the analyzer pipeline does).
 */
export async function getOrBuildGrowthMap(input: {
  analysisId: string;
  cached: unknown;
  result: AnalysisResult;
  url: string | null;
}): Promise<GrowthMapData> {
  if (isFreshCache(input.cached)) return input.cached;

  const data = await buildGrowthMap({ result: input.result, url: input.url });

  try {
    const svc = createSupabaseServiceClient();
    // Supabase types collapse to `never` here (see analyzer/[id]/page.tsx note);
    // cast the update payload to match the codebase's established workaround.
    await svc
      .from("analyses")
      .update({ growth_map: data } as never)
      .eq("id", input.analysisId);
  } catch (err) {
    // Cache write is non-critical — the payload still renders this request.
    console.warn("[growth-map] cache write failed:", (err as Error).message);
  }

  return data;
}

// Read-time Free/Pro gating lives in ./gate (pure, unit-testable). Re-exported
// here for the call sites that already import it from build.
export { gateForViewer } from "./gate";
