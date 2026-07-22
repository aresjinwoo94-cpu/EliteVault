import { z } from "zod";

/**
 * Strict Zod schemas — also serve as the JSON-schema we ship to Claude
 * as tool input_schema. Keeping them in one place guarantees the model's
 * output and our DB column stay in sync.
 */

export const BuyerPersonaSchema = z.object({
  age: z.union([z.number(), z.string()]).optional(),
  gender: z.enum(["male", "female", "any"]).optional(),
  country: z.string().optional(),
  interests: z.array(z.string()).max(8).optional(),
  income_band: z.string().optional(),
  notes: z.string().max(400).optional(),
});

export const ConversionScenariosSchema = z.object({
  organic: z.number().min(0).max(1),
  meta_ads_bad: z.number().min(0).max(1),
  meta_ads_regular: z.number().min(0).max(1),
  meta_ads_good: z.number().min(0).max(1),
});

/**
 * Annotations: ideally x/y/width/height are 0..1 normalized — the system
 * prompt asks for that. But Gemini Flash-Lite sometimes returns pixel
 * values (e.g. 320, 480) regardless. We accept ANY non-negative number
 * here and normalize at render time in AnnotationsOverlay (it scales by
 * the max value seen across the array — handles both normalized and
 * pixel-scale outputs robustly).
 */
export const AnnotationSchema = z.object({
  type: z.enum(["arrow", "circle", "cross", "highlight", "label"]),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().min(3).max(220),
  fix: z.string().min(3).max(260),
});

export const CategoryScoresSchema = z.object({
  color_integration: z.number().min(0).max(100),
  layout_proportion: z.number().min(0).max(100),
  image_quality: z.number().min(0).max(100),
  technical_optimization: z.number().min(0).max(100),
  niche_coherence: z.number().min(0).max(100),
  cro_principles: z.number().min(0).max(100),
});

export const TopFixSchema = z.object({
  title: z.string().min(3).max(120),
  impact: z.enum(["high", "medium", "low"]),
  effort: z.enum(["S", "M", "L"]),
  /**
   * The BUSINESS reason this fix matters — "cold Meta traffic can't tell what
   * you sell in 2 seconds, so they bounce before the offer lands", not "best
   * practice says heroes should be clear". A fix without a why is a checklist
   * item; with one it's an argument the owner can act on (and the difference
   * between this and a free audit tool).
   *
   * Optional in the schema so audits stored before this field existed still
   * validate and render.
   */
  why: z.string().max(280).optional(),
});

/**
 * "Can this page take paid traffic yet?" — the read a media buyer actually
 * wants before spending money, separate from the general design score.
 *
 * Optional: pre-existing analyses don't have it, and a model that omits it
 * must not fail the whole audit.
 */
export const AdReadinessSchema = z.object({
  /** ready = send traffic; almost = fix the blockers first; not_ready = don't. */
  verdict: z.enum(["ready", "almost", "not_ready"]),
  /** 0-100, judged ONLY on fitness for cold paid traffic. */
  score: z.number().min(0).max(100),
  /** One line on what decides it. */
  summary: z.string().min(10).max(400),
  /** What to fix BEFORE spending, highest-leverage first. */
  blockers: z
    .array(
      z.object({
        title: z.string().min(3).max(120),
        why: z.string().max(280),
      }),
    )
    .max(5)
    .optional(),
});

/**
 * NOTE: model output limits are kept generous (12 / 30 / 20) and we slice
 * down in the UI rather than rejecting valid analyses for an extra item.
 * The system prompt asks for tight ranges; this only acts as a safety bound.
 */
export const PersonaResponseSchema = z.object({
  headline: z.string().min(3).max(200),
  quotes: z.array(z.string().max(220)).min(1).max(12),
  would_buy: z.boolean(),
  reasons: z.array(z.string().max(220)).max(12),
});

export const AnalysisResultSchema = z.object({
  score: z.number().min(0).max(100),
  scenarios: ConversionScenariosSchema,
  category_scores: CategoryScoresSchema,
  buyer_persona_response: PersonaResponseSchema,
  annotations: z.array(AnnotationSchema).max(30),
  summary: z.string().min(10).max(2000),
  top_fixes: z.array(TopFixSchema).max(12),
  ad_readiness: AdReadinessSchema.optional(),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const RewriteResultSchema = z.object({
  section: z.string(),
  html: z.string().max(20_000),
  css: z.string().max(20_000),
  rationale: z.string().max(1500),
});
export type RewriteResult = z.infer<typeof RewriteResultSchema>;

/**
 * JSON-schema equivalents fed to Claude's tool_use API.
 * Hand-derived to keep them readable; tested against the Zod schemas.
 */
export const ANALYSIS_TOOL_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    scenarios: {
      type: "object",
      properties: {
        organic: { type: "number", minimum: 0, maximum: 1 },
        meta_ads_bad: { type: "number", minimum: 0, maximum: 1 },
        meta_ads_regular: { type: "number", minimum: 0, maximum: 1 },
        meta_ads_good: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["organic", "meta_ads_bad", "meta_ads_regular", "meta_ads_good"],
    },
    category_scores: {
      type: "object",
      properties: {
        color_integration: { type: "number", minimum: 0, maximum: 100 },
        layout_proportion: { type: "number", minimum: 0, maximum: 100 },
        image_quality: { type: "number", minimum: 0, maximum: 100 },
        technical_optimization: { type: "number", minimum: 0, maximum: 100 },
        niche_coherence: { type: "number", minimum: 0, maximum: 100 },
        cro_principles: { type: "number", minimum: 0, maximum: 100 },
      },
      required: [
        "color_integration",
        "layout_proportion",
        "image_quality",
        "technical_optimization",
        "niche_coherence",
        "cro_principles",
      ],
    },
    buyer_persona_response: {
      type: "object",
      properties: {
        headline: { type: "string" },
        quotes: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        would_buy: { type: "boolean" },
        reasons: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["headline", "quotes", "would_buy", "reasons"],
    },
    annotations: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["arrow", "circle", "cross", "highlight", "label"] },
          // Coordinates — see AnnotationSchema in this file. We accept any
          // non-negative number; the UI normalizes by max value seen.
          x: { type: "number", minimum: 0 },
          y: { type: "number", minimum: 0 },
          width: { type: "number", minimum: 0 },
          height: { type: "number", minimum: 0 },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          message: { type: "string" },
          fix: { type: "string" },
        },
        required: ["type", "x", "y", "severity", "message", "fix"],
      },
    },
    summary: { type: "string" },
    top_fixes: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          impact: { type: "string", enum: ["high", "medium", "low"] },
          effort: { type: "string", enum: ["S", "M", "L"] },
          // Required HERE (the contract for new generations) but optional in
          // the Zod schema, so older stored audits still validate.
          why: { type: "string" },
        },
        required: ["title", "impact", "effort", "why"],
      },
    },
    ad_readiness: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["ready", "almost", "not_ready"] },
        score: { type: "number", minimum: 0, maximum: 100 },
        summary: { type: "string" },
        blockers: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              why: { type: "string" },
            },
            required: ["title", "why"],
          },
        },
      },
      required: ["verdict", "score", "summary", "blockers"],
    },
  },
  required: [
    "score",
    "scenarios",
    "category_scores",
    "buyer_persona_response",
    "annotations",
    "summary",
    "top_fixes",
    "ad_readiness",
  ],
} as const;

export const REWRITE_TOOL_SCHEMA = {
  type: "object",
  properties: {
    section: { type: "string" },
    html: { type: "string" },
    css: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["section", "html", "css", "rationale"],
} as const;
