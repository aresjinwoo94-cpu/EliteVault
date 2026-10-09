import type { SimScenarioNumbers, Variant } from "@/lib/meta/simulation-engine";

/**
 * Narrative around the engine's numbers. The AI writes the real one (one call
 * for all 3 scenarios — ai/agents/meta-scenario-narrative-agent.ts); this
 * module holds the shape, the sanity check and the DETERMINISTIC fallback so a
 * model failure never costs the user their (already computed) numbers.
 */
export interface ScenarioNarrative {
  summary: string;
  win_condition: string;
  risks: string[];
  recommendation: string;
}

const usd = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

export function fallbackNarrative(
  s: SimScenarioNumbers,
  ctx: { score: number },
): ScenarioNarrative {
  const { spend, revenue, roas, roas_range: rr } = s.totals;
  const e = s.economics;
  const outcome = e
    ? e.verdict === "profit"
      ? `after ad spend at your margin this nets about ${usd(e.net_after_ads)}`
      : e.verdict === "loss"
        ? `after ad spend at your margin this loses about ${usd(e.net_after_ads)}`
        : "after ad spend at your margin this lands around break-even"
    : `it spends ${usd(spend)} to return about ${usd(revenue)} (add your margin to see profit)`;
  const weak = ctx.score < 55;
  const label = s.variant === "conservative" ? "Conservative" : s.variant === "balanced" ? "Balanced" : "Aggressive";
  const risks = [
    "Days 1-3 are Meta's learning phase: expect weak ROAS before it stabilises.",
    "Ads Manager under-reports conversions after iOS attribution loss; real sales may be somewhat higher.",
    weak
      ? "The audit score is low, so conversion on cold traffic is the main risk — more spend amplifies it."
      : "Creative fatigue and rising CPMs can erode ROAS after the first week.",
  ];
  if (s.variant === "aggressive") risks.push("Higher spend with narrower audiences makes results more volatile than the range suggests.");
  return {
    summary: `${label}: modeled 7-day ROAS ${rr[0].toFixed(1)}x–${rr[1].toFixed(1)}x (point ${roas.toFixed(2)}x); ${outcome}. A model, not a guarantee.`,
    win_condition: e
      ? `Reach at least ${e.break_even_roas.toFixed(2)}x ROAS — the break-even for a ${e.margin_pct}% margin.`
      : "Reach a ROAS above your break-even (100 ÷ your gross margin %). Add your margin to see it.",
    risks,
    recommendation: weak
      ? "Before increasing spend, fix the top issues from the audit; use a small budget to learn which creative and audience convert."
      : "Test creative angles at a controlled budget first, then scale only the ad sets that clear break-even.",
  };
}

/** Accept the model's text only if it is usable; otherwise the caller uses the fallback. */
export function sanitizeNarrative(raw: unknown): ScenarioNarrative | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const risks = Array.isArray(o.risks)
    ? o.risks.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => r.trim().slice(0, 300)).slice(0, 4)
    : [];
  const summary = str(o.summary, 600);
  const win = str(o.win_condition, 300);
  const rec = str(o.recommendation, 600);
  if (summary.length < 5 || win.length < 5 || rec.length < 5 || risks.length < 1) return null;
  return { summary, win_condition: win, risks, recommendation: rec };
}

export const NARRATIVE_VARIANTS: readonly Variant[] = ["conservative", "balanced", "aggressive"];
