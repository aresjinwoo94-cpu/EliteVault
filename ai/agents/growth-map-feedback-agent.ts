import "server-only";
import { getProvider } from "@/ai/provider";
import type { AnalysisResult } from "@/lib/supabase/types";
import { rankByIndex } from "@/lib/growth-map/ranks";
import type { GrowthMapPlacement } from "@/lib/growth-map/types";

/**
 * Growth Map — per-node micro-feedback (spec §5, "lo nuevo").
 *
 * The one AI call in the feature. It receives the store's OWN structured
 * findings (never the screenshot again — it's already analyzed) plus the
 * deterministic placement, and writes copy that MUST cite ≥1 concrete,
 * verifiable detail of THAT store. Two different stores get different findings
 * → necessarily different copy (spec §0).
 *
 * Anti-generic is enforced twice: the prompt forbids filler ("improve your
 * CRO", "optimize your store"), and `looksSpecific()` rejects any output that
 * doesn't reference real evidence. On any failure the caller falls back to the
 * honest deterministic scaffold — we never show an invented phrase.
 *
 * Best-effort: returns null on error/timeout/too-generic; the map still renders
 * from the scaffold. It never touches the analyzer pipeline.
 */

export interface GrowthMapAiCopy {
  diagnosis: string;
  currentNode: string;
  pastNote: string;
  nextTeaser: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    diagnosis: { type: "string" },
    current_node: { type: "string" },
    past_note: { type: "string" },
    next_teaser: { type: "string" },
  },
  required: ["diagnosis", "current_node", "past_note", "next_teaser"],
} as const;

const BANNED = [
  "improve your cro",
  "optimize your store",
  "optimise your store",
  "best practice",
  "best practices",
  "increase conversions",
  "boost sales",
  "take it to the next level",
  "elevate your brand",
  "unlock your potential",
];

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter(
    (t) =>
      ![
        "your",
        "store",
        "this",
        "that",
        "with",
        "from",
        "have",
        "they",
        "them",
        "visitor",
        "visitors",
        "conversion",
        "conversions",
      ].includes(t),
  );
}

/**
 * Does the copy reference real evidence, or is it generic filler? We require
 * that the diagnosis+current lines share at least one meaningful token with the
 * store's findings (brand, a fix title, an annotation message), and contain no
 * banned generic phrase.
 */
function looksSpecific(copy: GrowthMapAiCopy, evidenceHaystack: string): boolean {
  const text = `${copy.diagnosis} ${copy.currentNode}`.toLowerCase();
  if (text.trim().length < 40) return false;
  if (BANNED.some((b) => text.includes(b))) return false;

  const evidence = new Set(tokens(evidenceHaystack));
  const overlap = tokens(text).some((t) => evidence.has(t));
  return overlap;
}

export async function runGrowthMapFeedback(opts: {
  result: AnalysisResult;
  placement: GrowthMapPlacement;
  domain: string | null;
  nicheLabel: string;
  deadlineAt?: number;
  signal?: AbortSignal;
}): Promise<GrowthMapAiCopy | null> {
  const { result, placement, domain, nicheLabel } = opts;
  try {
    const rank = rankByIndex(placement.rankIndex);
    const nextRank = rankByIndex(placement.rankIndex + 1);

    // Assemble the store-specific evidence the model must ground its copy in.
    const fixes = (result.top_fixes ?? [])
      .slice(0, 4)
      .map((f) => `- ${f.title}${f.why ? ` — ${f.why}` : ""}`)
      .join("\n");
    const notes = (result.annotations ?? [])
      .slice(0, 5)
      .map((a) => `- ${a.message}`)
      .join("\n");
    const cats = result.category_scores;
    const catLine = cats
      ? `offer_clarity=${Math.round(cats.niche_coherence)}, cro=${Math.round(
          cats.cro_principles,
        )}, layout=${Math.round(cats.layout_proportion)}, imagery=${Math.round(
          cats.image_quality,
        )}, technical=${Math.round(cats.technical_optimization)}, cohesion=${Math.round(
          cats.color_integration,
        )}`
      : "n/a";

    const evidenceHaystack = [
      domain ?? "",
      result.summary ?? "",
      fixes,
      notes,
    ].join("\n");

    const system =
      "You are EliteVault's growth strategist. Voice: direct, concrete, no " +
      "fluff. You are annotating a store's position on a 6-rank growth map " +
      "(Copper→Steel→Silver→Gold→Diamond→Ruby). The store's rank is FIXED " +
      "(given). Your ONLY job is to explain it using SPECIFIC, verifiable " +
      "details from THIS store's findings.\n" +
      "HARD RULES:\n" +
      "1. Cite at least one concrete detail of THIS store (its brand/domain, a " +
      "specific finding, a named weak area). Never write copy that could apply " +
      "to any store.\n" +
      "2. BANNED phrases: 'improve your CRO', 'optimize your store', 'best " +
      "practices', 'increase conversions', 'boost sales', generic pep-talk.\n" +
      "3. diagnosis = 3-5 short sentences, why they're at this rank. " +
      "current_node = 1-2 sentences (the sharpest single point). past_note = " +
      "one line on what they've already nailed. next_teaser = one line on what " +
      "the NEXT rank unlocks (a hook, no step-by-step).\n" +
      "4. Do not state or guess the store's revenue. The $ bands are " +
      "approximate overlays, not facts.";

    const parts = [
      {
        text:
          `Store domain: ${domain ?? "(uploaded screenshot)"}\n` +
          `Niche: ${nicheLabel}\n` +
          `Current rank: ${rank.material} · ${rank.stage} (Churchill: ${rank.churchill})\n` +
          `Next rank: ${nextRank.material} · ${nextRank.stage}\n` +
          `Overall score: ${Math.round(
            result.score > 1 ? result.score : result.score * 100,
          )}/100\n` +
          `Category scores (0-100): ${catLine}\n` +
          `Placement signals: ${placement.signals.join("; ") || "n/a"}\n\n` +
          `Executive summary of the audit:\n${result.summary ?? "n/a"}\n\n` +
          `Prioritized fixes:\n${fixes || "n/a"}\n\n` +
          `Annotated observations:\n${notes || "n/a"}\n\n` +
          `Write the four fields. Ground every line in the details above.`,
      },
    ];

    const provider = await getProvider();
    const raw = await provider.generateStructured<{
      diagnosis: string;
      current_node: string;
      past_note: string;
      next_teaser: string;
    }>(
      {
        name: "submit_growth_map_feedback",
        description: "Submit store-specific growth-map node feedback.",
        schema: SCHEMA as unknown as Record<string, unknown>,
      },
      {
        system,
        temperature: 0.55,
        maxTokens: 700,
        fast: true,
        signal: opts.signal,
        deadlineAt: opts.deadlineAt,
        parts,
      },
    );

    const copy: GrowthMapAiCopy = {
      diagnosis: String(raw?.diagnosis ?? "").trim().slice(0, 640),
      currentNode: String(raw?.current_node ?? "").trim().slice(0, 280),
      pastNote: String(raw?.past_note ?? "").trim().slice(0, 200),
      nextTeaser: String(raw?.next_teaser ?? "").trim().slice(0, 220),
    };

    if (!looksSpecific(copy, evidenceHaystack)) {
      console.warn("[growth-map] AI copy too generic — using scaffold");
      return null;
    }
    return copy;
  } catch (err) {
    console.warn("[growth-map] feedback skipped:", (err as Error).message);
    return null;
  }
}
