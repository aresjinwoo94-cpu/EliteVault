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

/**
 * IMPORTANT — Zod bounds are deliberately LOOSE here.
 *
 * Gemini Flash-Lite is inconsistent about CTR units: sometimes it returns
 * decimals (0.025 for 2.5%) and sometimes percentages (2.5 for 2.5%).
 * Rejecting one form would fail ~half of all runs. We accept both via
 * loose bounds + a post-parse normalizer (`normalizeCtr` below).
 *
 * String length maxes are also generous — Flash-Lite occasionally writes
 * longer summaries than asked. Truncating is fine; rejecting kills the
 * whole scenario. We err on the side of accepting and shipping value.
 */
const DaySchema = z.object({
  day: z.number().min(1).max(7),
  spend: z.number().min(0),
  impressions: z.number().min(0),
  clicks: z.number().min(0),
  ctr: z.number().min(0).max(50), // accepts decimal (0..1) OR percentage (0..50); normalized post-parse
  cpc: z.number().min(0).max(50),
  cpm: z.number().min(0).max(200),
  purchases: z.number().min(0),
  revenue: z.number().min(0),
  cpa: z.number().min(0).max(1000),
  roas: z.number().min(0).max(20),
});

const ScenarioSchema = z.object({
  variant: z.enum(["conservative", "balanced", "aggressive"]),
  summary: z.string().min(5).max(800),
  win_condition: z.string().min(5).max(400),
  risks: z.array(z.string().max(400)).min(1).max(6),
  days: z.array(DaySchema).length(7),
  totals: z.object({
    spend: z.number().min(0),
    revenue: z.number().min(0),
    purchases: z.number().min(0),
    roas: z.number().min(0).max(20),
    cpa: z.number().min(0).max(1000),
  }),
  recommendation: z.string().min(5).max(800),
});

/**
 * Detect percentage-format CTR (e.g., 3.5 meaning 3.5%) and convert
 * to decimal (0.035). CTR > 1 is mathematically impossible as a decimal
 * (would mean > 100% click-through), so anything > 1 is percentage.
 *
 * Same defensive pattern we use elsewhere for annotation coordinates
 * (pixels vs normalized 0..1).
 */
function normalizeCtr(ctr: number): number {
  if (ctr > 1) return ctr / 100;
  return ctr;
}

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
- **CTR MUST be a DECIMAL between 0 and 0.08, NOT a percentage.**
  Examples: write 0.025 for 2.5% CTR. Write 0.04 for 4%. NEVER write 2.5 or 4.
  Typical: 0.005-0.035 for cold; 0.03-0.06 for warm retargeting; cap 0.08.
- CPC: $0.40-3.00 depending on niche and audience tightness (dollar amount).
- CPM: $5-40 depending on niche and audience (dollar amount).
- ROAS: 0.5-2 for low-score stores; 1.5-3.5 for balanced; up to 5 only for
  high-score stores under aggressive. NEVER above 6. Write as a multiplier
  (2.5 means 2.5x return), NOT as a percentage.
- Days 1-2 are typically the "learning phase" — worse metrics. Day 7 should
  be at the campaign's stable rate, not euphoric.
- "purchases" must equal floor(revenue / AOV). "cpa" must equal spend/purchases.
  Math must be internally consistent.
- ALWAYS list 2-4 specific risks (creative fatigue, iOS attribution loss,
  algorithm rollover, narrow audience saturation, etc.).
- "summary" must be ≤ 600 characters. "win_condition" ≤ 300. Each risk ≤ 300.
  "recommendation" must be a concrete tactical instruction ("kill ads under $X
  ROAS by day 3", "duplicate winning ads into Advantage+ at day 5", etc.) — ≤ 600 chars.

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

  // Post-parse normalization. Flash-Lite occasionally returns CTR as a
  // percentage (3.5) instead of a decimal (0.035) — the schema accepts
  // both forms, this step makes the downstream UI math consistent.
  const normalized = {
    ...parsed.data,
    variant: opts.variant, // force-correct in case the model echoed the wrong variant
    days: parsed.data.days.map((d) => ({
      ...d,
      ctr: normalizeCtr(d.ctr),
    })),
  };

  return normalized;
}
