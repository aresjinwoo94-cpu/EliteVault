import "server-only";
import { getProvider } from "@/ai/provider";
import {
  fallbackNarrative,
  sanitizeNarrative,
  NARRATIVE_VARIANTS,
  type ScenarioNarrative,
} from "@/lib/meta/scenario-narrative";
import type { SimScenarioNumbers, Variant } from "@/lib/meta/simulation-engine";

/**
 * ONE call that writes the narrative (summary, win condition, risks,
 * recommendation) for all 3 scenarios. It receives the numbers already computed
 * by lib/meta/simulation-engine.ts and must not change or invent any of them.
 * Replaces the three sequential per-scenario calls that used to INVENT the
 * numbers (and hit the free tier's 15 RPM): one call = faster, one 429 target.
 *
 * Never throws and never blocks the result: on any failure/garbage output it
 * returns the deterministic fallback so the user still gets the numbers.
 */
const ONE = {
  type: "object",
  properties: {
    summary: { type: "string" },
    win_condition: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
  },
  required: ["summary", "win_condition", "risks", "recommendation"],
} as const;
const SCHEMA = {
  type: "object",
  properties: { conservative: ONE, balanced: ONE, aggressive: ONE },
  required: ["conservative", "balanced", "aggressive"],
} as const;

export async function runScenarioNarrative(opts: {
  url: string;
  score: number;
  summary: string;
  niche: string | null;
  scenarios: Record<Variant, SimScenarioNumbers>;
  signal?: AbortSignal;
  deadlineAt?: number;
}): Promise<{ narratives: Record<Variant, ScenarioNarrative>; usedFallback: boolean }> {
  const fallback = () =>
    Object.fromEntries(
      NARRATIVE_VARIANTS.map((v) => [v, fallbackNarrative(opts.scenarios[v], { score: opts.score })]),
    ) as Record<Variant, ScenarioNarrative>;

  try {
    const provider = await getProvider();
    const lines = NARRATIVE_VARIANTS.map((v) => {
      const s = opts.scenarios[v];
      const e = s.economics;
      return (
        `${v.toUpperCase()}: spend $${s.totals.spend}, revenue $${s.totals.revenue}, purchases ${s.totals.purchases}, ` +
        `ROAS ${s.totals.roas}x (range ${s.totals.roas_range[0]}x-${s.totals.roas_range[1]}x), CPA $${s.totals.cpa}` +
        (e ? `, margin ${e.margin_pct}% → break-even ROAS ${e.break_even_roas}x, net after ads $${e.net_after_ads} (${e.verdict})` : ", margin unknown")
      );
    }).join("\n");

    const raw = await provider.generateStructured<Record<string, unknown>>(
      {
        name: "submit_scenario_narrative",
        description: "Submit the narrative for the 3 scenarios.",
        schema: SCHEMA as unknown as Record<string, unknown>,
      },
      {
        system:
          "You are a senior DTC media buyer writing the commentary for a 7-day Meta Ads projection. " +
          "The NUMBERS are already computed — never change, recompute or invent a number; quote them as given. " +
          "Be honest: ~60-70% of new Meta campaigns lose money in week 1 and days 1-3 are a learning phase. " +
          "Do not sugarcoat; a net loss is stated as a loss. No phrases like 'well-positioned' or 'opportunity for growth' without numbers. " +
          "For each scenario: summary ≤ 400 chars stating the honest 7-day outcome using the given figures; win_condition ≤ 250 chars; " +
          "2-4 niche-specific risks ≤ 250 chars each (mention iOS attribution under-reporting where relevant); recommendation ≤ 400 chars, " +
          "concrete and tactical — for audit score < 55 it should usually start with 'Before increasing spend, fix …'. This is an estimate, not a guarantee.",
        temperature: 0.4,
        maxTokens: 1800,
        fast: true,
        signal: opts.signal,
        deadlineAt: opts.deadlineAt,
        // Exactly ONE provider call per simulation: no deferred hedge (a second draw = a second quota hit).
        hedgeAfterMs: 0,
        parts: [
          {
            text:
              `Store: ${opts.url}\nNiche: ${opts.niche ?? "unknown"}\nAudit score: ${opts.score}/100\n` +
              `Audit summary: ${opts.summary.slice(0, 700)}\n\nComputed scenarios:\n${lines}\n\nCall the tool.`,
          },
        ],
      },
    );

    const out = {} as Record<Variant, ScenarioNarrative>;
    for (const v of NARRATIVE_VARIANTS) {
      const clean = sanitizeNarrative(raw?.[v]);
      if (!clean) return { narratives: fallback(), usedFallback: true };
      out[v] = clean;
    }
    return { narratives: out, usedFallback: false };
  } catch (err) {
    console.warn("[meta-sim] narrative failed, using deterministic fallback:", (err as Error).message);
    return { narratives: fallback(), usedFallback: true };
  }
}
