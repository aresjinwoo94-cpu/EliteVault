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
    tagline: "See where you stand",
    description:
      "One full audit of your store and one set of fixes you choose. No card needed.",
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
    quotas: { analysesPerMonth: 1, metaRunsPerMonth: 0 },
    features: [
      { text: "1 full store audit + your estimated revenue potential", included: true, highlight: true },
      { text: "Annotated screenshot of your page", included: true },
      { text: "1 set of fixes of your choice — unlocked", included: true, highlight: true },
      { text: "3 winning stores to learn from", included: true },
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For stores already selling",
    description:
      "Every fix for your store, how your buyer reacts to it, and the winning stores to model.",
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
    quotas: { analysesPerMonth: 40, metaRunsPerMonth: 1 },
    badge: "Most popular",
    highlight: true,
    features: [
      { text: "Every fix unlocked, ranked by priority", included: true, highlight: true },
      { text: "Buyer-persona reaction to each fix", included: true, highlight: true },
      { text: "40 audits / month — re-check after every change or audit competitors", included: true },
      { text: "Full Library of winning stores + image search", included: true },
      { text: "1 Meta Ads forecast / month", included: true, highlight: true },
      { text: "Community publishing + Compare Mode", included: true },
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    tagline: "For stores running paid traffic",
    description:
      "Forecast a 7-day Meta campaign across 3 scenarios before you spend a dollar.",
    price: { month: 29, year: 278 },
    stripePriceIds: {
      month: process.env.STRIPE_PRICE_SCALE_MONTHLY,
      year: process.env.STRIPE_PRICE_SCALE_YEARLY,
    },
    monthlyCredits: 200,
    unlocksAnalyzer: true,
    unlocksScale: true,
    canPublish: true,
    libraryFullMetricsCap: null,
    quotas: { analysesPerMonth: 200, metaRunsPerMonth: null },
    badge: "For Meta Ads spenders",
    features: [
      { text: "Everything in Pro", included: true },
      { text: "Unlimited Meta Ads forecasts — 7 days, 3 scenarios", included: true, highlight: true },
      { text: "Ads optimizer: CPC, CPM, CTR & ROAS targets", included: true, highlight: true },
      { text: "200 audits / month", included: true },
      { text: "API access", included: true },
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
