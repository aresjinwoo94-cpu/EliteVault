import type { PlanTier } from "@/lib/supabase/types";

export type Interval = "month" | "year";

export interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

export interface Plan {
  id: PlanTier;
  name: string;
  tagline: string;
  description: string;
  price: { month: number; year: number };
  stripePriceIds: { month?: string; year?: string };
  /** Monthly credits granted by this plan (0 = cannot analyze) */
  monthlyCredits: number;
  /** Whether this plan unlocks the Analyzer at all */
  unlocksAnalyzer: boolean;
  /** Whether this plan unlocks the Scale-tier extras: Meta Campaign Scenario Modeler + Meta Ads optimizer + REST API */
  unlocksScale: boolean;
  /** Whether the user can publish audits to Community */
  canPublish: boolean;
  /** Cap on Library entries the user sees FULL metrics for (null = unlimited) */
  libraryFullMetricsCap: number | null;
  /**
   * Server-enforced usage quotas (see lib/quota/guard.ts). The unified quota
   * guard reads these; cost must scale with price (Free is intentionally tiny
   * so it can never run up meaningful Gemini COGS).
   */
  quotas: {
    /** Store audits per billing period. Backed by profiles.credits so the
     *  Analyzer keeps its existing behaviour — this number must equal the
     *  effective credit grant (Free = 1 lifetime welcome credit). */
    analysesPerMonth: number;
    /** Niches the user can track for weekly Trend alerts (Phase 2/3). */
    trackedNiches: number;
    /**
     * Meta block runs (Campaign Scenario Modeler + Ads Optimizer, counted as
     * one unit) per billing period. Backed by a row count in meta_simulations.
     *   Free  = 0   (cannot run the Meta block)
     *   Pro   = 1   (the Pro→Scale bridge — one taste of the modeler)
     *   Scale = null (unlimited within its analyses quota)
     */
    metaRunsPerMonth: number | null;
  };
  features: PlanFeature[];
  badge?: string;
  highlight?: boolean;
}

export const PLANS: Record<PlanTier, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Audit your store free",
    description:
      "Run one free audit of your own store — overall score, annotated screenshot AND your #1 priority fix, unlocked, no credit card. Browse 3 hand-picked winning stores with full metrics and read the community feed. Upgrade to Pro to unlock the rest of your ranked fixes, buyer-persona simulation and unlimited audits.",
    price: { month: 0, year: 0 },
    stripePriceIds: {},
    // monthlyCredits stays 0: paid plans renew credits monthly via the
    // Stripe webhook; Free's single welcome credit comes from the DB
    // default (profiles.credits default 1), NOT a monthly renewal — so a
    // Free user gets exactly ONE free audit per account, never a refill.
    monthlyCredits: 0,
    // v4 conversion: Free now unlocks the Analyzer so a new user can feel
    // the "wow" (see THEIR store audited) before the paywall. The real
    // gate moved to credit balance (credits <= 0) in app/actions/analyzer.ts.
    unlocksAnalyzer: true,
    unlocksScale: false,
    canPublish: false,
    libraryFullMetricsCap: 3,
    quotas: { analysesPerMonth: 1, trackedNiches: 1, metaRunsPerMonth: 0 },
    features: [
      { text: "1 free audit: score + annotated screenshot", included: true, highlight: true },
      { text: "Your #1 priority fix — unlocked & actionable", included: true, highlight: true },
      { text: "3 hand-picked winners with full metrics", included: true },
      { text: "Browse the Community feed", included: true },
      { text: "The rest of your ranked fixes + buyer-persona simulation", included: false },
      { text: "AI image + text search across 45+ stores", included: false },
      { text: "Unlimited audits + publish to Community", included: false },
      { text: "Meta Campaign Scenario Modeler + Ads optimizer + API", included: false },
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Where most stores level up",
    description:
      "Full Library + brutal Analyzer with annotated screenshots, buyer-persona simulations, and the ability to publish your audits to the Community. Includes 1 Meta campaign projection per month.",
    price: { month: 19, year: 180 },
    stripePriceIds: {
      month: process.env.STRIPE_PRICE_PRO_MONTHLY,
      year: process.env.STRIPE_PRICE_PRO_YEARLY,
    },
    monthlyCredits: 40,
    unlocksAnalyzer: true,
    unlocksScale: false,
    canPublish: true,
    libraryFullMetricsCap: null,
    quotas: { analysesPerMonth: 40, trackedNiches: 5, metaRunsPerMonth: 1 },
    badge: "Most popular",
    highlight: true,
    features: [
      { text: "Everything in Free", included: true },
      { text: "Unlimited Library + full metrics", included: true },
      { text: "Image-similarity search", included: true },
      {
        text: "Website Analyzer with annotated screenshots",
        included: true,
        highlight: true,
      },
      { text: "Buyer-Persona simulations", included: true },
      { text: "40 analyses / month", included: true },
      { text: "Publish to Community + Compare Mode", included: true },
      {
        text: "1 Meta campaign projection / month",
        included: true,
        highlight: true,
      },
      { text: "Unlimited Meta projections + Ads optimizer + REST API", included: false },
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    tagline: "For brands hunting outsized ROI",
    description:
      "Diagnosis + cure + crystal ball. Project a 7-day Meta Ads campaign across 3 scenarios before you spend a dollar. Plus Meta Ads optimizer targets and REST API.",
    price: { month: 49, year: 499 },
    stripePriceIds: {
      month: process.env.STRIPE_PRICE_SCALE_MONTHLY,
      year: process.env.STRIPE_PRICE_SCALE_YEARLY,
    },
    monthlyCredits: 200,
    unlocksAnalyzer: true,
    unlocksScale: true,
    canPublish: true,
    libraryFullMetricsCap: null,
    quotas: { analysesPerMonth: 200, trackedNiches: 20, metaRunsPerMonth: null },
    badge: "For teams",
    features: [
      { text: "Everything in Pro", included: true },
      {
        text: "Meta Campaign Scenario Modeler: 7-day, 3-scenario AI projection",
        included: true,
        highlight: true,
      },
      {
        text: "Meta Ads optimizer: CPC, CPM, CTR & ROAS targets",
        included: true,
        highlight: true,
      },
      { text: "REST API access (bearer tokens)", included: true, highlight: true },
      { text: "200 analyses / month", included: true },
      { text: "Priority queue + priority support", included: true },
    ],
  },
};

export function planFromPriceId(priceId: string | null): PlanTier {
  if (!priceId) return "free";
  for (const plan of Object.values(PLANS)) {
    if (
      plan.stripePriceIds.month === priceId ||
      plan.stripePriceIds.year === priceId
    ) {
      return plan.id;
    }
  }
  return "free";
}

export function getCheckoutPriceId(
  plan: Exclude<PlanTier, "free">,
  interval: Interval,
): string | undefined {
  return PLANS[plan].stripePriceIds[interval];
}
