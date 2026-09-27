import type { AnalysisResult } from "@/lib/supabase/types";
import {
  adReadinessWords,
  potentialBandForResult,
  potentialWhyLines,
} from "@/lib/analyzer/report-v2";

/**
 * Shared-audit v2 (brief §4) — turn the public get_shared_audit RPC row into the
 * SAME hero the report shows, WITHOUT a score anywhere.
 *
 * The RPC returns only public-safe fields: the verdict, aggregate counts, the
 * qualitative potential_why, and (kept for the code-derived band) the score +
 * category_scores. This module reconstructs a partial AnalysisResult so the
 * report-v2 helpers (potentialBandForResult, adReadinessWords, potentialWhyLines)
 * can be reused verbatim — no logic is duplicated. It never surfaces top_fixes
 * titles or the persona (those stay paid) and never surfaces the score.
 */

export interface SharedAuditRow {
  url: string | null;
  score: number | null;
  summary: string | null;
  screenshot_url: string | null;
  category_scores: Record<string, number> | null;
  annotations: unknown[] | null;
  created_at: string | null;
  // report-v2 parity fields (absent on old shared audits / pre-migration RPC):
  ad_readiness_verdict?: string | null;
  blocker_count?: number | null;
  fix_count?: number | null;
  potential_why?: string[] | null;
  capture_blocked?: boolean | null;
}

/** English verdict phrases — mirror the report's report.v2Verdict* i18n copy.
 *  The public share page is server-rendered and English-only. */
const VERDICT_PHRASE = {
  ready: "Ready for cold paid traffic",
  almost: "Almost ready for cold paid traffic",
  not_ready: "Not ready for cold paid traffic",
} as const;
const VERDICT_GENERIC = "Here's what's costing you sales";

/**
 * Reconstruct the minimal AnalysisResult the report-v2 helpers read. Counts are
 * rebuilt as arrays of the right LENGTH (contents are placeholders — the counts
 * are all the helpers use), so the verdict's blocker count and the "leaks" count
 * match the real audit without ever exposing the fixes themselves.
 */
export function buildShareResult(row: SharedAuditRow): AnalysisResult {
  const verdict = row.ad_readiness_verdict;
  const validVerdict =
    verdict === "ready" || verdict === "almost" || verdict === "not_ready"
      ? verdict
      : null;
  const blockerN = Math.max(0, Math.round(Number(row.blocker_count ?? 0)) || 0);
  const fixN = Math.max(0, Math.round(Number(row.fix_count ?? 0)) || 0);
  const filler = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ title: `item ${i + 1}` }));

  return {
    score: typeof row.score === "number" ? row.score : Number(row.score) || 0,
    category_scores: (row.category_scores ?? {}) as AnalysisResult["category_scores"],
    summary: row.summary ?? "",
    buyer_persona_response: {
      headline: "",
      quotes: [],
      would_buy: false,
      reasons: [],
    },
    annotations: [],
    top_fixes: filler(fixN) as AnalysisResult["top_fixes"],
    ad_readiness: validVerdict
      ? {
          verdict: validVerdict,
          score: 0,
          summary: "",
          blockers: filler(blockerN).map((b) => ({ title: b.title, why: "" })),
        }
      : undefined,
    potential_why: Array.isArray(row.potential_why) ? row.potential_why : undefined,
    capture_blocked:
      typeof row.capture_blocked === "boolean"
        ? { detected: row.capture_blocked }
        : undefined,
  } as AnalysisResult;
}

/** The ad-readiness verdict as an English phrase (generic fallback for old
 *  audits that predate the field). Reuses adReadinessWords — no duplicated map. */
export function shareVerdictPhrase(result: AnalysisResult): string {
  const words = adReadinessWords(result);
  return words ? VERDICT_PHRASE[words.verdict] : VERDICT_GENERIC;
}

/**
 * The page/OG title + description — verdict + revenue-potential band + domain.
 * Deliberately contains NO score and NO "/100".
 */
export function shareMeta(
  domain: string,
  result: AnalysisResult,
): { title: string; description: string } {
  const verdict = shareVerdictPhrase(result);
  const band = potentialBandForResult(result);
  const bandPart = band ? ` · revenue potential ${band}` : "";
  // No "· EliteVault" suffix: the root layout's title template ("%s · EliteVault")
  // appends the brand. (Used as-is for the OG/JSON-LD headline too.)
  const title = `${domain} — ${verdict}${bandPart}`;
  const description = `${domain}: ${verdict.toLowerCase()}${
    band ? `, with an estimated revenue potential of ${band}` : ""
  }. See the full conversion audit, then audit your own store free.`;
  return { title, description };
}

/** The AI/generic "why this potential" lines for the share hero, or null. */
export function sharePotentialWhy(result: AnalysisResult): string[] | null {
  return potentialWhyLines(result);
}
