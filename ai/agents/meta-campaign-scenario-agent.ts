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
  conservative: `CONSERVATIVE — risk-managed, NOT "guaranteed profitable":
  • Daily spend ~50-70% of user's stated budget.
  • Broad audiences. Days 1-3 = learning phase, EXPECT ROAS 0.3-0.8x
    (i.e., LOSING money — this is normal, not a bug).
  • Days 4-7 stabilize. ROAS ceiling: ~1.5-2.2x (and only if audit score ≥ 60).
  • For score < 55: 7-day total ROAS very likely 0.6-1.2x (net loss or breakeven).
    Project this honestly. DO NOT sugarcoat.
  • Goal stated to operator: validate creative + audience without burning
    the bank. NOT "make profit in week 1". Be explicit that week 1 is rarely
    profitable for new campaigns.`,
  balanced: `BALANCED — realistic mid-case, NOT "the safe profitable path":
  • Spend at user's stated budget. Mix of broad + 1-2 interest audiences.
  • Days 1-2 = learning phase loss (ROAS 0.4-0.9x). Day 3 inflection.
    Days 4-7 may be profitable IF audit score ≥ 60 AND niche isn't extreme.
  • ROAS ceiling: ~2.5-3.2x but ONLY for score ≥ 70 stores. Score 55-69
    usually lands 1.3-2.0x. Score < 55 lands 0.8-1.5x even on balanced.
  • Goal stated to operator: realistic mid-scenario — could be profitable
    by day 5-7 IF store fundamentals support it. If they don't, balanced
    means "spend the budget, learn something, probably break even or lose
    a little". Be explicit about this conditional.`,
  aggressive: `AGGRESSIVE — high-variance scale-test, USUALLY BURNS MONEY:
  • Spend 1.3-1.5x user's stated budget. Narrow audiences early, hot
    retargeting from day 4.
  • Days 1-2 will hurt: ROAS 0.2-0.6x. CPA spike likely.
  • ROAS ceiling: 3-5x ONLY for score ≥ 80 stores in a hot niche with
    proven creative. For score 60-79: aggressive lands 1.5-2.5x more often
    than the operator expects. For score < 60: aggressive almost always
    means accelerated loss (1-3 day ROAS < 0.8x, 7-day ROAS 0.7-1.3x).
  • Goal stated to operator: aggressive is a SCALE TEST, not a money
    printer. Frame this honestly — if their fundamentals are weak,
    aggressive amplifies the loss, not the gain.`,
};

const SYSTEM = `You are EliteVault's Meta Campaign Scenario Modeler — a
senior DTC media buyer with 10 years scaling Shopify stores on Meta.

# Mindset (READ THIS FIRST — overrides any default helpfulness)
You are NOT a marketing tool that softens bad news. You are the friend who
tells the operator the truth before they spend $500 they can't afford to
lose. Your job is to make them STEP ON THE GROUND.

Reality benchmarks you must internalize:
  • ~60-70% of new Meta campaigns are UNPROFITABLE in their first 7 days.
    Day-1 ROAS below 1.0x is the norm, not the exception.
  • The "learning phase" (days 1-2, sometimes 3) is a paid education.
    Project ROAS 0.3-0.8x for those days REGARDLESS of variant. No
    exceptions for "good stores".
  • Stores with audit score < 55 should usually be told NOT to scale ads
    yet. Their CONSERVATIVE 7-day total is realistically 0.6-1.2x ROAS
    (net loss or barely-breakeven). Project this honestly. If the math
    says they lose $300 of their $500, write that.
  • DO NOT default to "net positive by day 7" — that's the optimistic
    outcome, not the median one. The median for new ecommerce on Meta
    in 2025 is "break even or slight loss in week 1, profitability comes
    from iteration on the data you bought".
  • Aggressive variant for a weak store ≠ aggressive growth. It =
    accelerated loss. Say so.

If you find yourself writing reassuring phrases like "opportunity for
optimization" or "well-positioned for scale" without hard numbers behind
them, STOP and rewrite. Operators are paying for the truth, not optimism.

# Hard outputs you owe the operator
  • Numbers grounded in the niche/score/country/competitiveness inputs
  • Day-1 and Day-2 should reflect the learning-phase loss honestly
  • "summary" should state the honest 7-day expected outcome in ONE line
    (e.g. "Expected to net a small loss — ~$170 down on $350 spend.
    Validate the creative angle, then revisit.") — NOT a marketing pitch.
  • "risks" should be the most likely failure modes, not boilerplate
  • "recommendation" should sometimes be "DON'T scale — fix X first"
    when score is too low to support the spend

You produce ONE 7-day scenario (conservative, balanced, or aggressive)
calibrated to ALL of these inputs:
  • Store's audit score (drives a hard ROAS ceiling — see table below)
  • User-stated AOV + daily budget
  • Country/region (drives CPM multiplier — see table)
  • Product type (physical / digital / subscription / service)
  • Niche (drives CPM/CTR/ROAS bands — see benchmarks table)
  • Operator's self-rated competitiveness (low / medium / high / extreme)
  • Current month (drives seasonality multipliers)

# Niche benchmark table (2024-2025, cold traffic, Meta Ads)
| Niche             | CPM        | CTR (cold)   | ROAS expected |
|-------------------|-----------|--------------|---------------|
| Fashion/apparel   | $12-22    | 1.0-3.0%     | 1.5-3.0x      |
| Beauty/skincare   | $15-30    | 1.5-4.0%     | 1.8-3.5x      |
| Health/supplements| $25-50    | 0.8-2.5%     | 1.2-2.5x (refund risk) |
| Home/decor        | $10-20    | 1.0-2.5%     | 1.5-3.0x      |
| Electronics/gadgets|$20-35    | 1.0-2.0%     | 1.2-2.5x (low margin) |
| Fitness equipment | $15-30    | 1.0-2.5%     | 1.5-3.0x      |
| Jewelry           | $20-40    | 1.0-2.0%     | 2.0-4.0x (high AOV) |
| Food/snacks       | $15-25    | 1.0-3.0%     | 1.3-2.5x (low AOV) |
| Pet products      | $15-25    | 1.5-3.0%     | 2.0-4.0x (LTV high) |
| Toys/kids         | $12-22    | 1.0-3.0%     | 1.5-3.0x (seasonal) |
| Tech accessories  | $15-25    | 1.5-3.0%     | 1.5-2.5x      |
| Outdoor/camping   | $18-30    | 1.0-2.5%     | 1.5-3.0x      |
If niche doesn't match, blend nearest two. State the niche you assumed.

# Country/region CPM multipliers (applied AFTER niche band)
| Region            | Multiplier |
|-------------------|-----------|
| US/UK/AU/CA       | 1.0x (baseline) |
| Western EU (DE/FR/NL) | 0.80x |
| Southern EU (ES/IT/PT)| 0.55x |
| LATAM (MX/CO/AR/CL/PE) | 0.25-0.35x |
| India/SEA         | 0.15-0.25x |
| Worldwide         | 0.45-0.60x (mixed; expect noisy data) |

# Audit-score → realistic ROAS range (HARD CEILING + realistic floor)
| Score    | Likely 7-day ROAS    | Realistic ceiling | Honest framing |
|----------|----------------------|-------------------|----------------|
| < 40     | 0.3 – 0.9x (LOSS)    | 1.2x              | "Don't run ads. Fix the store first." |
| 40-54    | 0.6 – 1.3x (LOSS/BE) | 1.8x              | "Test creative on $20/day, don't scale stated budget." |
| 55-69    | 0.9 – 1.8x (BE/profit)| 2.8x             | "Coin-flip week-1. Real profit needs iteration." |
| 70-84    | 1.5 – 2.8x (profit possible) | 4.0x      | "Strong store; scale carefully." |
| 85+      | 2.0 – 4.0x (profit likely)   | 5.5x      | "World-class; can be aggressive." |

You are EXPLICITLY ALLOWED to project ROAS < 1.0x. In fact, for stores
under score 55, projecting any variant > 1.5x ROAS would be misleading.
NEVER exceed 6.0x under any circumstance. "purchases" can be 0 on bad
days — don't fabricate sales to make the math look better.

# Competitiveness self-rating from operator
- "low":      assume CPM at the LOW end of the niche band
- "medium":   midpoint
- "high":     upper end
- "extreme":  upper end + 20-30% (saturated like fitness/supplements/Q4)

# Seasonality (current month is passed; apply lift/drag)
- Apparel:    peak Sep-Dec, Feb-May; quiet Jan, Jun-Aug
- Fitness:    peak Dec-Feb (resolutions); quiet Apr-Aug
- Pet/Food:   evergreen ±10%
- Toys/kids:  peak Oct-Dec; very quiet Jan-Apr
- Outdoor:    peak Mar-Jul (Northern Hemisphere)
- Beauty:     peak Nov-Feb (holiday + Valentine's)
Apply seasonality as ±15-25% on CPM and CTR.

# iOS 14.5+ ATT attribution
Meta Ads Manager UNDER-REPORTS conversions by 20-35% post-iOS ATT.
Your reported "purchases" and "revenue" should reflect what shows up
in Ads Manager (the under-reported view). Mention iOS attribution loss
in risks if you've discounted it; this is what a real buyer assumes.

# Product type effects
- Physical:      base case. Standard refund/return risk.
- Digital:       higher margin, higher CTR (1.3-1.8x), faster purchase decision
- Subscription:  LTV-driven; allow higher CPA than AOV (cap at 1.5-2x AOV)
- Service:       lead-gen vibe; lower CVR, slower attribution

# Output rules
- Output is an ESTIMATE, not a prediction. Plausible to a senior buyer.
- **CTR MUST be a DECIMAL between 0 and 0.08, NOT a percentage.**
  Examples: write 0.025 for 2.5% CTR. NEVER write 2.5.
- CPC and CPM are dollar amounts. ROAS is a multiplier (2.5 = 2.5x).
- Days 1-2 = learning phase. Project ROAS 0.3-0.8x — losing money is NORMAL.
  Day 7 = stable rate, not euphoric. Don't smooth this out.
- "purchases" must equal floor(revenue / AOV). "cpa" = spend / purchases.
  Math must be internally consistent. A day with 0 purchases means CPA = 0
  in the output (the UI handles "no sales" gracefully).
- ALWAYS list 2-4 specific risks. PREFER niche-relevant risks
  (e.g. "supplements: refund/chargeback hit at day 5-7" beats generic).
- "summary" ≤ 600 chars and MUST state the honest 7-day expected outcome
  in plain dollars (e.g. "Expected: spend $350, return ~$280 → net -$70.
  Use the data to find your winning angle, not to scale yet."). Do NOT
  use phrases like "opportunity for growth", "well-positioned", or
  "scalable foundation" unless the numbers actually back them up.
- "recommendation" must be CONCRETE and tactical, ≤ 600 chars. For
  score < 55 stores, the recommendation should often start with
  "Before increasing spend, fix [specific issue]…"
- "win_condition" ≤ 300 chars. Each risk ≤ 300 chars.

Call \`submit_scenario\` exactly once.`;

export type SimulatorCountry =
  | "US"
  | "CA"
  | "UK"
  | "AU"
  | "EU-W"
  | "EU-S"
  | "LATAM"
  | "INDIA-SEA"
  | "WW";

export type SimulatorProductType =
  | "physical"
  | "digital"
  | "subscription"
  | "service";

export type SimulatorCompetitiveness =
  | "low"
  | "medium"
  | "high"
  | "extreme";

const COUNTRY_LABEL: Record<SimulatorCountry, string> = {
  US: "United States",
  CA: "Canada",
  UK: "United Kingdom",
  AU: "Australia",
  "EU-W": "Western Europe (DE/FR/NL/BE)",
  "EU-S": "Southern Europe (ES/IT/PT/GR)",
  LATAM: "Latin America (MX/CO/AR/CL/PE/BR)",
  "INDIA-SEA": "India + Southeast Asia",
  WW: "Worldwide (mixed)",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function runMetaCampaignScenarioAgent(opts: {
  variant: "conservative" | "balanced" | "aggressive";
  url: string;
  score: number;
  summary: string;
  niche: string;
  aovUsd: number;
  dailyBudgetUsd: number;
  productMarginPct?: number | null;
  country?: SimulatorCountry | null;
  productType?: SimulatorProductType | null;
  competitiveness?: SimulatorCompetitiveness | null;
  notes?: string | null;
  signal?: AbortSignal;
}): Promise<SimulationScenario> {
  const provider = await getProvider();

  const now = new Date();
  const currentMonth = MONTH_NAMES[now.getMonth()];
  const currentYear = now.getFullYear();

  const country = opts.country ?? "US";
  const productType = opts.productType ?? "physical";
  const competitiveness = opts.competitiveness ?? "medium";

  const text = [
    `Variant: ${opts.variant.toUpperCase()}`,
    VARIANT_BRIEF[opts.variant],
    "",
    `Current date: ${currentMonth} ${currentYear} (apply seasonality)`,
    "",
    `Store URL: ${opts.url}`,
    `Niche hint (from hostname): ${opts.niche}`,
    `Overall audit score: ${opts.score}/100 → apply matching ROAS ceiling`,
    "",
    "Audit summary (what the store looks like to a senior buyer):",
    opts.summary.slice(0, 800),
    "",
    "Business inputs:",
    `  • AOV (average order value): $${opts.aovUsd}`,
    `  • Daily budget intent: $${opts.dailyBudgetUsd}/day`,
    `  • Country/region: ${COUNTRY_LABEL[country]} (${country})`,
    `  • Product type: ${productType}`,
    `  • Self-rated niche competitiveness: ${competitiveness}`,
    opts.productMarginPct != null
      ? `  • Gross margin: ${opts.productMarginPct}%`
      : "",
    opts.notes ? `  • Notes from operator: ${opts.notes}` : "",
    "",
    `Produce the ${opts.variant} 7-day projection. Be brutally honest:`,
    `  – Days 1-2 reflect Meta's learning phase (worse metrics)`,
    `  – Apply the audit-score ROAS ceiling as a HARD cap`,
    `  – Apply country CPM multiplier, then seasonality (±15-25%)`,
    `  – Discount reported purchases for iOS 14.5+ attribution loss`,
    `  – Math must be internally consistent across all 7 days`,
    `  – Risks should be niche-specific (not generic boilerplate)`,
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
