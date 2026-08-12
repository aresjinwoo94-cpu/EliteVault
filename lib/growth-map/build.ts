import "server-only";
import type { AnalysisResult } from "@/lib/supabase/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveNicheLabel } from "@/lib/growth-map/niche";
import { runGrowthMapFeedback } from "@/ai/agents/growth-map-feedback-agent";
import { growthMapHistoryEnabled, growthMapIssueDiffEnabled } from "@/lib/flags";
import {
  linkIssues,
  snapshotIssues,
  diffIssues,
  type IssueSnapshot,
} from "@/lib/analyzer/link-issues";
import { computePlacement, compositeOf } from "./placement";
import { scaffoldNodes, scaffoldDiagnosis } from "./phrase-bank";
import { RANKS } from "./ranks";
import { isRankMoveConfident, crossedWall } from "./movement";
import {
  GROWTH_MAP_VERSION,
  type GrowthMapData,
  type GrowthMapMovement,
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
  userId?: string | null;
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

  // §1.2 — record this run's placement point (once per analysis, on first build)
  // so a LATER run for the same domain can show movement. Best-effort, flagged.
  await recordPlacementPoint({
    analysisId: input.analysisId,
    userId: input.userId ?? null,
    url: input.url,
    result: input.result,
    rankIndex: data.placement.rankIndex,
  });

  return data;
}

/**
 * §1.2 — persist one placement point for the domain (best-effort, flag-gated).
 * Service-role write; failure never affects the rendered map.
 */
async function recordPlacementPoint(input: {
  analysisId: string;
  userId: string | null;
  url: string | null;
  result: AnalysisResult;
  rankIndex: number;
}): Promise<void> {
  if (!growthMapHistoryEnabled()) return;
  const domain = domainOf(input.url);
  if (!domain) return;
  try {
    const svc = createSupabaseServiceClient();
    // §D — persist the canonical-issue snapshot alongside the point so a later
    // run can diff against it. Deterministic, derived from the same result; the
    // `issues` column is additive (migration 0025) and null-safe for old rows.
    const issues = snapshotIssues(linkIssues(input.result));
    await svc.from("growth_map_history").insert({
      domain,
      user_id: input.userId,
      analysis_id: input.analysisId,
      composite: compositeOf(input.result),
      rank_index: input.rankIndex,
      issues,
    } as never);
  } catch (err) {
    console.warn("[growth-map] history write failed:", (err as Error).message);
  }
}


/**
 * §1.2 — movement vs the previous run for this domain. Reads the most recent
 * point that is NOT this analysis (service-role; the table has no client
 * policies). Returns null when the feature is off or there's no prior run — the
 * map then renders the current run as the first point, gracefully.
 */
export async function readGrowthMovement(input: {
  analysisId: string;
  url: string | null;
  result: AnalysisResult;
  currentComposite: number;
  currentRankIndex: number;
}): Promise<GrowthMapMovement | null> {
  if (!growthMapHistoryEnabled()) return null;
  const domain = domainOf(input.url);
  if (!domain) return null;
  try {
    const svc = createSupabaseServiceClient();
    const { data } = await svc
      .from("growth_map_history")
      .select("composite, rank_index, created_at, analysis_id, issues")
      .eq("domain", domain)
      .neq("analysis_id", input.analysisId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prev = data as unknown as {
      composite: number;
      rank_index: number;
      created_at: string;
      issues: IssueSnapshot[] | null;
    } | null;
    if (!prev) return null;

    const movement: GrowthMapMovement = {
      previousComposite: prev.composite,
      currentComposite: input.currentComposite,
      previousRankIndex: prev.rank_index,
      currentRankIndex: input.currentRankIndex,
      previousAt: prev.created_at,
      crossedWall: crossedWall(prev.rank_index, input.currentRankIndex),
      // A4 — only call a rank/Wall change "real" when the composite cleared the
      // ±noise margin; otherwise the UI shows intra-stage progress, not a flip.
      rankMoveConfident: isRankMoveConfident(
        prev.composite,
        input.currentComposite,
        prev.rank_index,
        input.currentRankIndex,
      ),
    };

    // §D — the issue-level diff is the protagonist of "what changed". Only when
    // the flag is on and the previous run actually persisted snapshots (old rows
    // have issues = null → no diff, just score movement).
    if (growthMapIssueDiffEnabled() && Array.isArray(prev.issues) && prev.issues.length) {
      const currentIssues = snapshotIssues(linkIssues(input.result));
      movement.issueDelta = diffIssues(prev.issues, currentIssues);
    }

    return movement;
  } catch (err) {
    console.warn("[growth-map] history read failed:", (err as Error).message);
    return null;
  }
}

// Read-time Free/Pro gating lives in ./gate (pure, unit-testable). Re-exported
// here for the call sites that already import it from build.
export { gateForViewer } from "./gate";
