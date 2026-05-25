import "server-only";
import { z } from "zod";
import { getProvider } from "@/ai/provider";
import type { SimulationScenario } from "@/lib/supabase/types";

/**
 * Meta Campaign Scenario Modeler — generates ONE scenario (conservative,
 * balanced, or aggressive) for a 7-day Meta Ads simulation.
 *
 * We deliberately run ONE scenario per call (vs. all 3 in a single prompt):
 *   • Smaller output (3-5KB) reliably fits in Gemini Flash-Lite's stable
 *     JSON-mode window. Mixing all 3 has truncated for us at ~12-15KB.
 *   • Independent calls = independent failure mode. If aggressive fails,
 *     we still ship conservative + balanced rather than the whole sim.
 *   • Parallelism — 3 calls in parallel take ~1× the time of 1 call.
 *
 * Outputs are HONEST estimates calibrated on:
 *   - Audit score (low score → discounted ROAS)
 *   - User-provided AOV + daily budget
 *   - Niche benchmarks baked into the system prompt
 *
 * The output is NOT a prediction. The agent's `risks` array and the UI's
 * disclaimer reinforce this. We will refuse to claim ROAS > 8x or CTR
 * > 8% under any niche — those are unrealistic ceilings.
 */

const DaySchema = z.object({
  day: z.number().min(1).max(7),
  spend: z.number().min(0),
  impressions: z.number().min(0),
  clicks: z.number().min(0),
  ctr: z.number().min(0).max(0.15),
  cpc: z.number().min(0).max(50),
  cpm: z.number().min(0).max(150),
  purchases: z.number().min(0),
  revenue: z.number().min(0),
  cpa: z.number().min(0).max(500),
  roas: z.number().min(0).max(10),
});

const ScenarioSchema = z.object({
  variant: z.enum(["conservative", "balanced", "aggressive"]),
  summary: z.string().min(10).max(300),
  win_condition: z.string().min(10).max(200),
  risks: z.array(z.string().max(200)).min(1).max(5),
  days: z.array(DaySchema).length(7),
  totals: z.object({
    spend: z.number().min(0),
    revenue: z.number().min(0),
    purchases: z.number().min(0),
    roas: z.number().min(0).max(10),
    cpa: z.number().min(0).max(500),
  }),
  recommendation: z.string().min(10).max(400),
});

const SCHEMA = {
  type: "object",
  properties: {
    variant: { type: "string", enum: ["conservative", "balanced", "aggressive"] },
    summary: { type: "string" },
    win_condition: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "number" },
          spend: { type: "number" },
          impressions: { type: "number" },
          clicks: { type: "number" },
          ctr: { type: "number" },
          cpc: { type: "number" },
          cpm: { type: "number" },
          purchases: { type: "number" },
          revenue: { type: "number" },
          cpa: { type: "number" },
          roas: { type: "number" },
        },
        required: [
          "day", "spend", "impressions", "clicks",
          "ctr", "cpc", "cpm", "purchases", "revenue", "cpa", "roas",
        ],
      },
    },
    totals: {
      type: "object",
      properties: {
        spend: { type: "number" },
        revenue: { type: "number" },
        purchases: { type: "number" },
        roas: { type: "number" },
        cpa: { type: "number" },
      },
      required: ["spend", "revenue", "purchases", "roas", "cpa"],
    },
    recommendation: { type: "string" },
  },
  required: [
    "variant", "summary", "win_condition", "risks",
    "days", "totals", "recommendation",
  ],
} as const;

const VARIANT_BRIEF: Record<string, string> = {
  conservative: `CONSERVATIVE: spend low, target broad audiences, expect days 1-3
to be in "learning" with poor metrics. Days 4-7 should stabilize but not
hockey-stick. ROAS ceiling: ~1.5-2.5x. Goal: validate creative + audience
without burning budget. Daily spend ~50-70% of user's stated budget.`,
  balanced: `BALANCED: spend at the user's stated budget. Mix of broad + 1-2
interest audiences. Day 1 inefficient (learning), days 4-7 should be
profitable. ROAS ceiling: ~2-3.5x. Goal: net positive by day 5-7.`,
  aggressive: `AGGRESSIVE: spend 1.3-1.5x user's stated budget, narrow audiences,
heavy retargeting from day 4. High variance — could deliver 3-5x ROAS or
blow up. Day 1-2 may show high CPA. ROAS ceiling: ~3-5x but with stated
risks. Goal: scale-test, not cautious.`,
};

const SYSTEM = `You are EliteVault's Meta Campaign Scenario Modeler — a
senior media buyer with 10 years scaling DTC ecommerce on Meta.

You produce ONE scenario (conservative, balanced, or aggressive) for a
7-day Meta Ads simulation, based on:
  • An ecommerce store's audit score
  • The user's stated AOV (average order value)
  • The user's stated daily budget
  • Niche benchmarks

# Hard rules
- Output is an ESTIMATE, not a prediction. Your numbers should be plausible
  to a senior media buyer but never optimistic beyond niche benchmarks.
- CTR: 0.5-3.5% typical for cold; 3-6% for warm retargeting; never above 8%.
- CPC: $0.40-3.00 depending on niche and audience tightness.
- CPM: $5-40 depending on niche and audience.
- ROAS: 0.5-2x for low-score stores; 1.5-3.5x for balanced cases; up to 5x
  only for high-score stores under the aggressive variant. NEVER above 6x.
- Days 1-2 are typically the "learning phase" — worse metrics. Day 7 should
  be at the campaign's stable rate, not euphoric.
- "purchases" must equal floor(revenue / AOV). "cpa" must equal spend/purchases.
  Math must be internally consistent.
- ALWAYS list 2-4 specific risks (creative fatigue, iOS attribution loss,
  algorithm rollover, narrow audience saturation, etc.).
- "recommendation" is a concrete tactical instruction ("kill ads under $X
  ROAS by day 3", "duplicate winning ads into Advantage+ at day 5", etc.).

You will receive the variant + audit context + AOV + budget. Call
\`submit_scenario\` exactly once.`;

export async function runMetaCampaignScenarioAgent(opts: {
  variant: "conservative" | "balanced" | "aggressive";
  url: string;
  score: number;
  summary: string;
  niche: string;
  aovUsd: number;
  dailyBudgetUsd: number;
  productMarginPct?: number | null;
  notes?: string | null;
  signal?: AbortSignal;
}): Promise<SimulationScenario> {
  const provider = await getProvider();

  const text = [
    `Variant: ${opts.variant.toUpperCase()}`,
    VARIANT_BRIEF[opts.variant],
    "",
    `Store URL: ${opts.url}`,
    `Niche: ${opts.niche}`,
    `Overall audit score: ${opts.score}/100`,
    "",
    "Audit summary (what the store looks like to the buyer):",
    opts.summary.slice(0, 800),
    "",
    "User-provided business inputs:",
    `  • AOV (average order value): $${opts.aovUsd}`,
    `  • Daily budget intent: $${opts.dailyBudgetUsd}/day`,
    opts.productMarginPct != null
      ? `  • Gross margin: ${opts.productMarginPct}%`
      : "",
    opts.notes ? `  • Notes from operator: ${opts.notes}` : "",
    "",
    `Produce the ${opts.variant} 7-day projection. Be honest. Days 1-2 should
reflect Meta's learning phase. Internal math must be consistent.`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await provider.generateStructured<unknown>(
    {
      name: "submit_scenario",
      description: `Submit the ${opts.variant} 7-day scenario.`,
      schema: SCHEMA,
    },
    {
      system: SYSTEM,
      temperature: opts.variant === "aggressive" ? 0.55 : 0.4,
      maxTokens: 4096,
      fast: true,        // Flash-Lite is plenty for this
      signal: opts.signal,
      parts: [{ text }],
    },
  );

  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Scenario agent (${opts.variant}): schema mismatch — ` +
        parsed.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
    );
  }

  // Force-correct the variant field in case the model echoed wrong value.
  return { ...parsed.data, variant: opts.variant };
}
