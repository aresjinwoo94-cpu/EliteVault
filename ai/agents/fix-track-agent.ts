import "server-only";
import { getProvider } from "@/ai/provider";
import { FIX_TRACK_TOOL_SCHEMA, type FixTrackFix } from "@/ai/schemas";
import type { AnalysisResult, Teardown } from "@/lib/supabase/types";
import { sanitizeFixes, type GeneratedTrack } from "@/lib/analyzer/fix-tracks";
import { SHOPIFY_THEMES } from "@/lib/analyzer/shopify-themes";

/**
 * Fix Tracks — the ONE extra AI call per (analysis, track), made on demand and
 * cached by the route (docs/store-audit-fix-tracks-premium.md §3.2).
 *
 * TEXT ONLY: it receives the store's own already-saved findings, never the
 * screenshot, so it is cheap and never touches the analyzer pipeline. Same
 * discipline as growth-map-feedback-agent: every fix must carry `evidence` from
 * THIS store (checked in code by sanitizeFixes); on any failure or if nothing
 * survives the checks we return null and the route caches NOTHING — never an
 * invented or generic answer.
 */

export interface CompetitorContext {
  title: string;
  domain: string;
  teardown: Teardown;
}

const TRACK_BRIEF: Record<GeneratedTrack, string> = {
  post_purchase:
    "TRACK: sell more AFTER the purchase. You only see ONE product page — not the checkout, thank-you page or emails — " +
    "so give recommendations of what to BUILD after the purchase, deduced from what is visible: price/ticket, whether the " +
    "product is consumable (repurchase) or one-off, existing bundles, cross-sell, subscription or visible reviews. Examples " +
    "of the KIND of fix: a one-click post-purchase offer with a SPECIFIC complementary product, a bundle / buy-2, " +
    "subscribe-and-save if it is replenishable, a review request after delivery. Never claim to have seen the checkout or emails.",
  theme_colors:
    "TRACK: Shopify theme & colours. Focus is what to change FIRST without breaking what already sells. Give: a palette " +
    "adjustment (current hex from OBSERVED PALETTE → suggested hex and why for THIS niche; if no palette is given, give colour " +
    "DIRECTION only, no hex), a typography direction, and at most ONE theme recommendation chosen ONLY from the ALLOWED THEMES " +
    "list (set theme_slug to its slug; leave theme_slug out on fixes that do not recommend a theme). Use the colour-integration " +
    "and layout scores and colour/layout annotations as evidence.",
  competitor:
    "TRACK: match the top store of the niche. Each fix is a gap on one dimension: what the competitor does (cite its " +
    "teardown observation) → what THIS store does (cite its annotation or score on that dimension) → what to change. The " +
    "evidence field MUST cite both sides.",
};

function themeList(): string {
  return SHOPIFY_THEMES.map((t) => `- ${t.slug}: ${t.name} (free) — ${t.fits}`).join("\n");
}

export async function runFixTrack(opts: {
  track: GeneratedTrack;
  result: AnalysisResult;
  domain: string | null;
  nicheLabel: string | null;
  locale: "en" | "es";
  competitor?: CompetitorContext | null;
  deadlineAt?: number;
  signal?: AbortSignal;
}): Promise<{ fixes: FixTrackFix[]; haystack: string } | null> {
  const { track, result, domain, locale } = opts;
  try {
    const cs = result.category_scores;
    const palette = result.observed_palette ?? [];
    const fixes = (result.top_fixes ?? [])
      .slice(0, 6)
      .map((f) => `- ${f.title}${f.why ? ` — ${f.why}` : ""}`)
      .join("\n");
    const notes = (result.annotations ?? [])
      .slice(0, 8)
      .map((a) => `- [${a.severity}] ${a.message}`)
      .join("\n");
    const persona = result.buyer_persona_response
      ? `${result.buyer_persona_response.headline}; ${(result.buyer_persona_response.reasons ?? []).join("; ")}`
      : "";
    const comp = opts.competitor;
    const compText = comp
      ? `Competitor: ${comp.title} (${comp.domain})\nWhy it converts: ${comp.teardown.summary}\n` +
        comp.teardown.elements
          .slice(0, 8)
          .map((e) => `- [${e.dimension}] ${e.element}: ${e.observation} → takeaway: ${e.takeaway}`)
          .join("\n")
      : "";

    const haystack = [
      domain ?? "",
      result.summary ?? "",
      fixes,
      notes,
      persona,
      palette.join(" "),
      result.ad_readiness?.summary ?? "",
      compText,
    ].join("\n");

    const system =
      "You are EliteVault's conversion strategist. Voice: direct, concrete, no fluff.\n" +
      `${TRACK_BRIEF[track]}\n` +
      "HARD RULES:\n" +
      "1. Return at most 3 fixes, highest leverage first. Each: title, impact (high|medium|low), effort (S|M|L), why (the business reason), evidence.\n" +
      "2. evidence = a SHORT quote/paraphrase of a concrete detail from THIS store's findings below (its brand/domain, a named finding, a colour, a score). A fix that could apply to any store is worthless — omit it.\n" +
      "3. No invented numbers: never write a % or $ figure, uplift or revenue estimate. These are estimates, not guarantees.\n" +
      "4. BANNED filler: 'improve your CRO', 'optimize your store', 'best practices', 'increase conversions', 'boost sales'.\n" +
      "5. Never name a Shopify theme in title/why/evidence unless it is in ALLOWED THEMES (and then set theme_slug).
" +
      "6. Only use facts in the data below; if the data is thin, return fewer fixes.\n" +
      (locale === "es"
        ? "LANGUAGE: write every human-readable string in natural Spanish. Keep enum values, JSON keys and slugs exactly as the schema requires."
        : "LANGUAGE: English.");

    const text =
      `Store: ${domain ?? "(uploaded screenshot)"}\nNiche: ${opts.nicheLabel ?? "unknown"}\n` +
      `Category scores (0-100): ${
        cs
          ? `colour_integration=${Math.round(cs.color_integration)}, layout=${Math.round(cs.layout_proportion)}, imagery=${Math.round(cs.image_quality)}, technical=${Math.round(cs.technical_optimization)}, offer_clarity=${Math.round(cs.niche_coherence)}, cro=${Math.round(cs.cro_principles)}`
          : "n/a"
      }\n` +
      `Audit summary: ${result.summary ?? "n/a"}\n\nExisting prioritized fixes:\n${fixes || "n/a"}\n\nAnnotated observations:\n${notes || "n/a"}\n\n` +
      `Buyer persona reaction: ${persona || "n/a"}\n` +
      (track === "theme_colors"
        ? `\nOBSERVED PALETTE: ${palette.length ? palette.join(", ") : "(not available — give colour direction only, no hex)"}\n\nALLOWED THEMES:\n${themeList()}\n`
        : "") +
      (track === "competitor" ? `\n${compText}\n` : "") +
      "\nCall the tool with the fixes.";

    const provider = await getProvider();
    const raw = await provider.generateStructured<{ fixes: unknown }>(
      {
        name: "submit_fix_track",
        description: "Submit store-specific fixes for one Fix Track.",
        schema: FIX_TRACK_TOOL_SCHEMA as unknown as Record<string, unknown>,
      },
      {
        system,
        temperature: 0.4,
        maxTokens: 900,
        fast: true,
        signal: opts.signal,
        deadlineAt: opts.deadlineAt,
        parts: [{ text }],
      },
    );

    // sanitizeFixes validates each item and DROPS (never repairs) anything weak.
    const clean = sanitizeFixes(raw?.fixes, { track, haystack });
    if (clean.length === 0) {
      console.warn(`[fix-tracks] ${track}: nothing specific survived — not caching`);
      return null;
    }
    return { fixes: clean, haystack };
  } catch (err) {
    console.warn(`[fix-tracks] ${track} failed:`, (err as Error).message);
    return null;
  }
}
