import "server-only";
import { z } from "zod";
import { getProvider } from "@/ai/provider";
import type { MetaAdsRecommendation, BuyerPersona } from "@/lib/supabase/types";

/**
 * Meta Ads Optimizer agent.
 *
 * Given a successful website audit + persona + score, this agent produces
 * concrete media-buying targets (CPC/CPM/CTR/ROAS), creative angles, and a
 * testing plan. Tuned for Scale-plan users — costs an extra ~$0.01 per
 * analysis on Flash.
 *
 * IMPORTANT: outputs are *recommendations* based on niche benchmarks +
 * audit signals — never promises about specific ROAS. The system prompt
 * + caveats array enforce that honesty.
 */

const MetaAdsSchema = z.object({
  niche: z.string(),
  audience_seed: z.string().min(10).max(300),
  budget_band: z.object({
    daily_min: z.number().min(1).max(10000),
    daily_max: z.number().min(1).max(10000),
    currency: z.literal("USD"),
  }),
  targets: z.object({
    cpc: z.number().min(0.01).max(20),
    cpm: z.number().min(0.5).max(100),
    ctr: z.number().min(0).max(0.2),
    roas: z.number().min(0.5).max(10),
    cvr: z.number().min(0).max(0.3),
  }),
  creatives: z
    .array(
      z.object({
        angle: z.string().min(3).max(160),
        hook: z.string().min(3).max(200),
        cta: z.string().min(2).max(40),
        format: z.enum(["single-image", "carousel", "ugc-video", "demo-video"]),
      }),
    )
    .min(2)
    .max(6),
  targeting: z.object({
    interests: z.array(z.string()).max(15),
    custom_audiences: z.array(z.string()).max(8),
    exclusions: z.array(z.string()).max(8),
  }),
  testing_plan: z
    .array(
      z.object({
        step: z.string().min(3).max(200),
        budget: z.number().min(5).max(10000),
        days: z.number().min(1).max(30),
      }),
    )
    .min(2)
    .max(8),
  caveats: z.array(z.string().max(200)).min(1).max(6),
});

const SCHEMA = {
  type: "object",
  properties: {
    niche: { type: "string" },
    audience_seed: { type: "string" },
    budget_band: {
      type: "object",
      properties: {
        daily_min: { type: "number" },
        daily_max: { type: "number" },
        currency: { type: "string", enum: ["USD"] },
      },
      required: ["daily_min", "daily_max", "currency"],
    },
    targets: {
      type: "object",
      properties: {
        cpc: { type: "number" },
        cpm: { type: "number" },
        ctr: { type: "number" },
        roas: { type: "number" },
        cvr: { type: "number" },
      },
      required: ["cpc", "cpm", "ctr", "roas", "cvr"],
    },
    creatives: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          angle: { type: "string" },
          hook: { type: "string" },
          cta: { type: "string" },
          format: {
            type: "string",
            enum: ["single-image", "carousel", "ugc-video", "demo-video"],
          },
        },
        required: ["angle", "hook", "cta", "format"],
      },
    },
    targeting: {
      type: "object",
      properties: {
        interests: { type: "array", items: { type: "string" } },
        custom_audiences: { type: "array", items: { type: "string" } },
        exclusions: { type: "array", items: { type: "string" } },
      },
      required: ["interests", "custom_audiences", "exclusions"],
    },
    testing_plan: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          step: { type: "string" },
          budget: { type: "number" },
          days: { type: "number" },
        },
        required: ["step", "budget", "days"],
      },
    },
    caveats: { type: "array", items: { type: "string" } },
  },
  required: [
    "niche",
    "audience_seed",
    "budget_band",
    "targets",
    "creatives",
    "targeting",
    "testing_plan",
    "caveats",
  ],
} as const;

const SYSTEM = `You are EliteVault's Meta Ads Optimizer — a senior media buyer
with 8+ years scaling DTC ecommerce on Meta. You think in CAC and breakeven
ROAS, not vanity metrics.

You receive a website audit (score, scenarios, top fixes) and a buyer
persona. Output realistic Meta Ads targets for THIS store given THIS audit.

# Rules
- Targets must reflect the audit. A 35-score store cannot hit 4x ROAS on
  cold traffic — adjust expectations honestly.
- Use niche-specific benchmarks (skincare ≠ apparel ≠ supplements).
- CTR/CVR are decimals 0..1 (0.02 = 2%).
- Budget band is *test budget* per day for the launch phase — not lifetime.
- 3-5 creatives, each with a distinct angle (problem-aware / desire / social proof / scarcity / authority).
- testing_plan is sequential: "Launch broad", "Cut + scale winners", etc.
- ALWAYS include at least 2 caveats about what these numbers can't predict
  (creative fatigue, iOS attribution, seasonal volatility).
- NEVER guarantee outcomes. Recommend, don't promise.

Call \`submit_meta_ads\` exactly once.`;

export async function runMetaAdsOptimizerAgent(opts: {
  url: string;
  score: number;
  summary: string;
  topFixes: { title: string; impact: string }[];
  persona: BuyerPersona | null;
  niche?: string;
  /** v2.2 — multi-page discovery context for richer targeting. */
  siteInfo?: {
    title: string | null;
    description: string | null;
    prices: string[];
    platform: string | null;
  } | null;
  signal?: AbortSignal;
}): Promise<MetaAdsRecommendation> {
  const provider = await getProvider();
  const raw = await provider.generateStructured<unknown>(
    {
      name: "submit_meta_ads",
      description: "Submit Meta Ads recommendations for this store.",
      schema: SCHEMA,
    },
    {
      system: SYSTEM,
      temperature: 0.5,
      maxTokens: 4096,
      signal: opts.signal,
      parts: [
        {
          text: [
            `Store URL: ${opts.url}`,
            opts.niche ? `Niche guess: ${opts.niche}` : "",
            `Overall score: ${opts.score}/100`,
            "",
            "Audit summary:",
            opts.summary,
            "",
            "Top fixes (in order of impact):",
            opts.topFixes
              .slice(0, 5)
              .map((f, i) => `  ${i + 1}. ${f.title} [${f.impact}]`)
              .join("\n"),
            "",
            opts.siteInfo
              ? [
                  "SITE CONTEXT (extracted from the live store HTML):",
                  opts.siteInfo.title
                    ? `  Title: ${opts.siteInfo.title}`
                    : "",
                  opts.siteInfo.description
                    ? `  Description: ${opts.siteInfo.description}`
                    : "",
                  opts.siteInfo.platform
                    ? `  Platform: ${opts.siteInfo.platform}`
                    : "",
                  opts.siteInfo.prices?.length
                    ? `  Detected prices: ${opts.siteInfo.prices.slice(0, 6).join(", ")} ← USE these to set realistic CPC/CPA (lower-AOV products need lower CPC; high-ticket can absorb $3+ CPC).`
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n")
              : "",
            "",
            opts.persona
              ? `Buyer persona:\n${JSON.stringify(opts.persona, null, 2)}`
              : "Buyer persona: not specified — use sensible default for niche.",
            "",
            "Produce Meta Ads targets, creatives, targeting and testing plan.",
            "Reference the actual product + price in your audience_seed and creative hooks.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    },
  );

  const parsed = MetaAdsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      "Meta Ads agent: schema mismatch — " +
        parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
    );
  }
  return parsed.data;
}
