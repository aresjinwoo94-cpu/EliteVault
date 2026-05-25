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
  features: PlanFeature[];
  badge?: string;
  highlight?: boolean;
}

export const PLANS: Record<PlanTier, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Taste the vault",
    description:
      "Browse 9 hand-picked winning stores with full metrics. Read the community feed. Upgrade to analyze your own store or use the AI image-similarity search.",
    price: { month: 0, year: 0 },
    stripePriceIds: {},
    monthlyCredits: 0,
    unlocksAnalyzer: false,
    unlocksScale: false,
    canPublish: false,
    libraryFullMetricsCap: 9,
    features: [
      { text: "Browse the Community feed", included: true },
      { text: "9 hand-picked winners with full metrics", included: true, highlight: true },
      { text: "AI image + text search across 45+ stores", included: false },
      { text: "Save to private collections", included: false },
      { text: "Website Analyzer", included: false },
      { text: "Publish to Community", included: false },
      { text: "Meta Campaign Scenario Modeler + Ads optimizer + API", included: false },
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Where most stores level up",
    description:
      "Full Library + brutal Analyzer with annotated screenshots, buyer-persona simulations, and the ability to publish your audits to the Community.",
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
      { text: "Meta Campaign Scenario Modeler + API", included: false },
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
      { text: "Priority queue + Slack support", included: true },
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
