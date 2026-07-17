import "server-only";
import { resolveAnalyzerProviders } from "@/ai/provider";
import {
  ANALYSIS_TOOL_SCHEMA,
  AnalysisResultSchema,
  type AnalysisResult,
} from "@/ai/schemas";
import { ANALYZER_SYSTEM, buildAnalyzerUserMessage } from "@/ai/prompts";
import type { BuyerPersona } from "@/lib/supabase/types";

export interface SiteInfo {
  title: string | null;
  description: string | null;
  prices: string[];
  platform: string | null;
  extraPages?: string[];
  // v3.3 — full-page content for the analyzer's written audit. Screenshot
  // is still the first-impression anchor; this gives the AI the rest.
  headings?: string[];
  bodyExcerpt?: string | null;
  reviewSnippets?: string[];
  ratingSignal?: string | null;
  trustSignals?: string[];
  faqQuestions?: string[];
  ctaTexts?: string[];
  imageAlts?: string[];
}

/**
 * Runs the full Analyzer agent on a screenshot.
 *
 * Whichever provider is configured (AI_PROVIDER=gemini|anthropic) emits a
 * single structured object matching AnalysisResultSchema. We validate with
 * Zod as a final guardrail so a flaky generation can't crash the UI.
 *
 * v2.2: the optional `siteInfo` from the multi-page discovery step is
 * folded into the user prompt so the model sees actual product titles +
 * detected prices + platform hints alongside the screenshot.
 */
export async function runAnalyzerAgent(opts: {
  screenshotBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  url?: string;
  persona?: BuyerPersona | null;
  htmlExcerpt?: string;
  siteInfo?: SiteInfo | null;
  /**
   * v2.2b — additional screenshots from discovered product pages. The
   * model sees them as separate image parts and references them in
   * annotations/persona response. Annotation positioning stays anchored
   * to the PRIMARY screenshot (homepage).
   */
  extraScreenshots?: {
    url: string;
    base64: string;
    mediaType: "image/png" | "image/jpeg";
  }[];
  /**
   * P1.1 — when true, prefer the cheaper/faster model variant (Gemini
   * Flash-Lite tier). Used for the free audit so its marginal cost stays
   * in cents. Paid audits leave this undefined/false → premium model.
   */
  fast?: boolean;
  signal?: AbortSignal;
}): Promise<AnalysisResult> {
  // Route by tier (free/fast vs paid) and optionally fall back to the other
  // provider on a hard failure. Defaults preserve the previous single-provider
  // behaviour — see resolveAnalyzerProviders.
  const { primary, fallback } = await resolveAnalyzerProviders(
    Boolean(opts.fast),
  );

  // Build parts: PRIMARY screenshot first (so annotation coords map to it)
  // + labeled extra screenshots + text prompt.
  const parts = [
    {
      mediaType: opts.mediaType,
      base64: opts.screenshotBase64,
    } as const,
  ];

  const extras = opts.extraScreenshots ?? [];
  for (const extra of extras) {
    parts.push({
      mediaType: extra.mediaType,
      base64: extra.base64,
    } as const);
  }

  const extraUrls = extras.map((e) => e.url);

  parts.push({
    text: buildAnalyzerUserMessage({
      url: opts.url,
      persona: (opts.persona as Record<string, unknown> | null) ?? null,
      htmlExcerpt: opts.htmlExcerpt,
      siteInfo: opts.siteInfo ?? null,
      extraScreenshotUrls: extraUrls,
    }),
  } as never);

  const tool = {
    name: "submit_analysis",
    description:
      "Submit the structured audit for the provided ecommerce store.",
    schema: ANALYSIS_TOOL_SCHEMA,
  };
  const generateOpts = {
    system: ANALYZER_SYSTEM,
    temperature: 0.4,
    // Full audit JSON can be 5-8k chars — give the model headroom so it
    // doesn't truncate mid-string (which broke schema validation before).
    maxTokens: 8192,
    // P1.1 — free audits run on the cheap/fast model tier.
    fast: opts.fast,
    signal: opts.signal,
    parts,
  };

  let raw: unknown;
  try {
    raw = await primary.generateStructured<unknown>(tool, generateOpts);
  } catch (err) {
    // Don't fall back on a user-initiated cancel — that's not a provider fault.
    if (opts.signal?.aborted || !fallback) throw err;
    console.warn(
      `[analyzer] provider "${primary.name}" failed (${
        (err as Error).message
      }) — falling back to "${fallback.name}"`,
    );
    raw = await fallback.generateStructured<unknown>(tool, generateOpts);
  }

  const parsed = AnalysisResultSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[analyzer] schema mismatch", parsed.error.flatten());
    throw new Error(
      "Analyzer: tool output failed validation — " +
        parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
    );
  }
  return parsed.data;
}
