import "server-only";
import { resolveAnalyzerProviders, type GenerateOptions } from "@/ai/provider";
import {
  ANALYSIS_TOOL_SCHEMA,
  ANALYSIS_TOOL_SCHEMA_WITH_PALETTE,
  AnalysisResultSchema,
  type AnalysisResult,
} from "@/ai/schemas";
import { ANALYZER_SYSTEM, buildAnalyzerUserMessage } from "@/ai/prompts";
import { classifyPageKind } from "@/lib/analyzer/page-kind";
import { analyzerFixTracksEnabled } from "@/lib/flags";
import type { BuyerPersona } from "@/lib/supabase/types";
import { deadlineAt, isDeadlineError } from "@/lib/deadline";
import {
  fetchNicheGroundingPriors,
  renderGroundingBlock,
} from "@/lib/library/grounding";

/**
 * Sampling temperature for the audit. Low by design — see the comment at the
 * call site. Tunable without a deploy via ANALYZER_TEMPERATURE.
 */
const ANALYZER_TEMPERATURE = (() => {
  const raw = Number(process.env.ANALYZER_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.2;
})();

/**
 * Output-token ceiling for the audit. Default UNCHANGED at 8192 — see the long
 * note at the call site for why raising it was tried once and reverted.
 *
 * Exposed as an env so the experiment can be re-run against real traffic
 * without a deploy, and so a measurement can be taken rather than argued about.
 *
 * The upper bound is 16384, NOT the provider's 32768 retry cap. Setting it to
 * exactly 32768 would silently disable truncation recovery: the retry computes
 * `wider = min(base * 2, 32768)` and only fires when `wider > base`
 * (ai/providers/gemini.ts), so at the cap there is no wider ceiling to retry
 * with and a recoverable truncation becomes a hard failure and a refund. 16384
 * keeps a full doubling of headroom.
 */
const ANALYZER_MAX_TOKENS_MAX = 16_384;
const ANALYZER_MAX_TOKENS = (() => {
  const raw = Number(process.env.ANALYZER_MAX_TOKENS);
  return Number.isFinite(raw) && raw >= 4096 && raw <= ANALYZER_MAX_TOKENS_MAX
    ? Math.round(raw)
    : 8192;
})();

/** Test-only view of the resolved ceiling — see scripts/tests/analyzer-max-tokens. */
export const ANALYZER_MAX_TOKENS_FOR_TEST = ANALYZER_MAX_TOKENS;

/**
 * How long the vision call waits before FORCING a hedged second draw on another
 * key (overrides a stale global GEMINI_HEDGE_AFTER_MS=0).
 *
 * The hedge is the one real lever against the measured failure mode on Vercel
 * Hobby's 50s step: Gemini's vision latency varies 8.5s → past 50s on identical
 * input (docs/analyzer-latency.md §4b — Google-side queueing, not page weight or
 * quota). Racing a second draw and keeping whichever finishes first turns
 * P(one draw > 50s) into P(BOTH draws > 50s), which is what collapses the
 * step-retry rate that makes 68% of successful audits pay for a retry today.
 *
 * Lowered from 12s to 9s: at a ~20-30s median vision time, 9s leaves the backup
 * draw ~40s of the step to beat a stuck primary, materially more tail coverage
 * than 12s bought, while almost every audit was already hedging by 12s anyway
 * (so the extra quota cost is one draw starting 3s sooner, not a new one).
 * No-op with <2 keys (local dev). Tunable without a deploy via
 * ANALYZER_HEDGE_AFTER_MS; 0 disables the forced hedge.
 */
const ANALYZER_HEDGE_AFTER_MS = (() => {
  const raw = Number(process.env.ANALYZER_HEDGE_AFTER_MS);
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 9_000;
})();

/** Test-only view of the resolved forced-hedge delay. */
export const ANALYZER_HEDGE_AFTER_MS_FOR_TEST = ANALYZER_HEDGE_AFTER_MS;

/**
 * After this long with no answer from the primary model (primary + hedge
 * draws), the NEXT model of the fallback chain starts in parallel and the first
 * schema-valid answer wins (docs/analyzer-speed-fix-free-tier.md §4.2).
 *
 * The hedge fixes a slow DRAW; it can't fix a saturated MODEL, where all six
 * keys queue behind the same overloaded backend (2026-10-01: gemini-3.6-flash
 * "slow past 12s" on almost every audit). 25s leaves the switched model ~25s
 * of a 50s step, which the benchmark's p50 for a healthy flash model fits.
 *
 *   ANALYZER_MODEL_SWITCH_AFTER_MS=0      off (sequential fallback only, as before)
 *   ANALYZER_MODEL_SWITCH_AFTER_MS=20000  switch sooner (more parallel calls)
 * Values between 1 and 5000 are raised to 5000: switching sooner just doubles
 * every call. Garbage falls back to the default.
 */
export function resolveModelSwitchAfterMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 25_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 25_000;
  if (n === 0) return 0;
  return Math.max(5_000, Math.round(n));
}

const ANALYZER_MODEL_SWITCH_AFTER_MS = resolveModelSwitchAfterMs(
  process.env.ANALYZER_MODEL_SWITCH_AFTER_MS,
);

/** Test-only view of the resolved model-switch delay. */
export const ANALYZER_MODEL_SWITCH_AFTER_MS_FOR_TEST = ANALYZER_MODEL_SWITCH_AFTER_MS;

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
  /** Language of the human-readable audit text. Default English. */
  locale?: "en" | "es";
  signal?: AbortSignal;
  /**
   * Absolute epoch-ms instant this audit must be done by (see lib/deadline.ts).
   * Bounds the provider's internal retry ladders AND decides whether a
   * fallback attempt is worth starting — the vision call is the longest step
   * in the pipeline, so it's the one that used to run into the platform's 60s
   * ceiling and 504.
   */
  deadlineAt?: number;
  /** How the kept answer was produced (model, latency…), for analyses.timings. */
  onAnswer?: GenerateOptions["onAnswer"];
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

  // Brief §2.3 — optional niche grounding (flag-gated inside the helper, hard
  // timeout, empty fallback). It's a Supabase read, not a third-party call, so
  // it respects the request-path rule; when the flag is off this is a no-op.
  const grounding = await fetchNicheGroundingPriors({
    url: opts.url ?? null,
    hint: opts.siteInfo
      ? `${opts.siteInfo.title ?? ""} ${opts.siteInfo.description ?? ""}`
      : null,
  });

  parts.push({
    text: buildAnalyzerUserMessage({
      url: opts.url,
      persona: (opts.persona as Record<string, unknown> | null) ?? null,
      htmlExcerpt: opts.htmlExcerpt,
      siteInfo: opts.siteInfo ?? null,
      // WP-B — derived from the URL rather than threaded through the caller, so
      // it's correct even when discovery returned nothing (a blocked or
      // unreachable page still knows what KIND of page it was).
      pageKind: classifyPageKind(opts.url ?? null),
      extraScreenshotUrls: extraUrls,
      groundingBlock: grounding ? renderGroundingBlock(grounding) : null,
      locale: opts.locale,
    }),
  } as never);

  const tool = {
    name: "submit_analysis",
    description:
      "Submit the structured audit for the provided ecommerce store.",
    // Fix Tracks §3.3 — palette only when the flag is on; off ⇒ byte-identical schema.
    schema: analyzerFixTracksEnabled() ? ANALYSIS_TOOL_SCHEMA_WITH_PALETTE : ANALYSIS_TOOL_SCHEMA,
  };
  const generateOpts = {
    system: ANALYZER_SYSTEM,
    // Low temperature on purpose. The same store re-audited must not swing 15
    // points between runs — inconsistent scores destroy trust in the number
    // faster than a slightly duller phrasing costs us. Override with
    // ANALYZER_TEMPERATURE if the copy ever reads too flat.
    temperature: ANALYZER_TEMPERATURE,
    // The binding constraint here is TIME, not tokens: flash generates at
    // ~100-200 tok/s and the step budget is ~50s (Vercel's 60s ceiling), so
    // anything past ~8k tokens simply can't finish before the deadline aborts
    // the call ("This operation was aborted"). Raising this to 16384 traded
    // truncation for timeouts. The real fix is bounding OUTPUT size (capped
    // annotation/fix counts in the prompt + schema) so a rich store still fits
    // under 8192 — which both avoids truncation and finishes in time.
    //
    // WP-C made it tunable WITHOUT changing that default. Live measurement
    // showed 2 of 3 real stores hitting the ceiling and paying a full extra
    // call, so the tradeoff is worth re-measuring on real traffic — but the
    // note above is a recorded experiment, not a guess, and the brief's rule is
    // to prefer not-failing over hitting 30s. Set ANALYZER_MAX_TOKENS to
    // re-run that experiment in production without a deploy.
    maxTokens: ANALYZER_MAX_TOKENS,
    // P1.1 — free audits run on the cheap/fast model tier.
    fast: opts.fast,
    signal: opts.signal,
    deadlineAt: opts.deadlineAt,
    // Tall/heavy stores fix: DON'T cap this call at the default 25s. The vision
    // call is the longest in the pipeline, and a tall page's render is
    // legitimately slow-but-steady (~30-45s) — the 25s cap cut it on every draw
    // so those audits refunded even though they'd have finished. 0 lets it use
    // the whole step budget; variance and hard failures are still bounded by the
    // hedge (GEMINI_HEDGE_AFTER_MS, default on), the step retry and the model
    // fallback chain. Small stores are unaffected (they finish well under 25s).
    callCapMs: 0,
    // …and FORCE the deferred hedge on for the vision call, overriding a stale
    // global GEMINI_HEDGE_AFTER_MS=0. The hedge races a second draw on another
    // key when the first is slow and keeps whichever finishes first — the
    // measured fix for Gemini's provider-side latency variance, which is what
    // pushes a draw past the 50s step and forces a retry. See the const above.
    hedgeAfterMs: ANALYZER_HEDGE_AFTER_MS,
    // …and if the whole MODEL is saturated (the hedge can't help: every key
    // queues alike), race the next model of the chain inside the same step.
    // Only a schema-valid answer wins that race, so a fast-but-malformed draw
    // can't beat a correct one; see the const above.
    modelSwitchAfterMs: ANALYZER_MODEL_SWITCH_AFTER_MS,
    accept: (r: unknown) => AnalysisResultSchema.safeParse(r).success,
    onAnswer: opts.onAnswer,
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
