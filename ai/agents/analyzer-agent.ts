import "server-only";
import { resolveAnalyzerProviders } from "@/ai/provider";
import {
  ANALYSIS_TOOL_SCHEMA,
  AnalysisResultSchema,
  type AnalysisResult,
} from "@/ai/schemas";
import { ANALYZER_SYSTEM, buildAnalyzerUserMessage } from "@/ai/prompts";
import type { BuyerPersona } from "@/lib/supabase/types";
import { deadlineAt, isDeadlineError } from "@/lib/deadline";

/**
 * Sampling temperature for the audit. Low by design — see the comment at the
 * call site. Tunable without a deploy via ANALYZER_TEMPERATURE.
 */
const ANALYZER_TEMPERATURE = (() => {
  const raw = Number(process.env.ANALYZER_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.2;
})();

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
  /**
   * Absolute epoch-ms instant this audit must be done by (see lib/deadline.ts).
   * Bounds the provider's internal retry ladders AND decides whether a
   * fallback attempt is worth starting — the vision call is the longest step
   * in the pipeline, so it's the one that used to run into the platform's 60s
   * ceiling and 504.
   */
  deadlineAt?: number;
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
    // Low temperature on purpose. The same store re-audited must not swing 15
    // points between runs — inconsistent scores destroy trust in the number
    // faster than a slightly duller phrasing costs us. Override with
    // ANALYZER_TEMPERATURE if the copy ever reads too flat.
    temperature: ANALYZER_TEMPERATURE,
    // Headroom against truncation. 8192 was NOT enough: a content-rich store
    // (many annotations + fixes + the persona reaction) overshot it and came
    // back as half-written JSON, which failed the audit and refunded the
    // credit. The provider now widens the ceiling and retries on truncation,
    // but that costs the user another full model call — so start high enough
    // that the common case never needs it. Output tokens are only billed for
    // what's actually generated, so a bigger ceiling costs nothing when the
    // report is short.
    maxTokens: 16384,
    // P1.1 — free audits run on the cheap/fast model tier.
    fast: opts.fast,
    signal: opts.signal,
    deadlineAt: opts.deadlineAt,
    parts,
  };

  const dl = deadlineAt(opts.deadlineAt ?? Number.MAX_SAFE_INTEGER);
  /** Below this there's no room for another full vision call. */
  const MIN_ATTEMPT_MS = 12_000;

  let raw: unknown;
  try {
    raw = await primary.generateStructured<unknown>(tool, generateOpts);
  } catch (err) {
    // Don't fall back on a user-initiated cancel — that's not a provider fault.
    if (opts.signal?.aborted || !fallback) throw err;
    // Nor when we ran out of time: a second attempt would be cut off by the
    // platform (a 504 Inngest can't retry cleanly) instead of failing here.
    if (isDeadlineError(err) || !dl.has(MIN_ATTEMPT_MS)) throw err;
    console.warn(
      `[analyzer] provider "${primary.name}" failed (${
        (err as Error).message
      }) — falling back to "${fallback.name}"`,
    );
    raw = await fallback.generateStructured<unknown>(tool, generateOpts);
  }

  let parsed = AnalysisResultSchema.safeParse(raw);

  // ── One repair pass on invalid output ──────────────────────────────────
  // A malformed generation used to fail the whole audit and refund the credit,
  // even though the model is usually one field away from valid. We hand the
  // exact validation errors back and ask for a corrected object — but only if
  // the budget can absorb another call.
  if (!parsed.success && dl.has(MIN_ATTEMPT_MS)) {
    const issues = formatIssues(parsed.error.issues);
    console.warn(`[analyzer] schema mismatch — repair pass. ${issues}`);
    try {
      const repaired = await primary.generateStructured<unknown>(tool, {
        ...generateOpts,
        parts: [
          ...parts,
          {
            text:
              "Your previous submission FAILED validation and was rejected. " +
              `Problems: ${issues}. ` +
              "Resubmit the COMPLETE audit with every required field present " +
              "and every value inside its stated range. Change nothing else.",
          } as never,
        ],
      });
      const second = AnalysisResultSchema.safeParse(repaired);
      if (second.success) parsed = second;
    } catch (err) {
      console.warn("[analyzer] repair pass failed:", (err as Error).message);
    }
  }

  if (!parsed.success) {
    console.error("[analyzer] schema mismatch", parsed.error.flatten());
    throw new Error(
      "Analyzer: tool output failed validation — " +
        formatIssues(parsed.error.issues),
    );
  }
  return parsed.data;
}

function formatIssues(issues: { path: (string | number)[]; message: string }[]) {
  return issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
