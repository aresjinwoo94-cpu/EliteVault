import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalysisView } from "@/components/analyzer/analysis-view";
import type { AnalysisResult } from "@/lib/supabase/types";

/**
 * Design preview of the anonymous audit reveal — the real (identical-to-free)
 * AnalysisView in anonymous mode, with mock data. The live anonymous audit is
 * single-use (rate-limited), so this lets the team eyeball the design on demand
 * with no AI spend.
 *
 * Gated behind ENABLE_ANON_PREVIEW so it never renders in production unless
 * explicitly enabled. Always noindex + robots-disallowed.
 */
export const metadata: Metadata = {
  title: "Anon reveal preview (internal)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const RESULT: AnalysisResult = {
  score: 45,
  summary:
    "Your store looks polished but reads as risky to a first-time buyer: the hero doesn't say what makes the jewelry worth the price, there's no visible social proof above the fold, and shipping/returns are buried. Cold visitors bounce before they trust you.",
  scenarios: {
    organic: 0.028,
    meta_ads_bad: 0.006,
    meta_ads_regular: 0.014,
    meta_ads_good: 0.027,
  },
  category_scores: {
    color_integration: 72,
    layout_proportion: 58,
    image_quality: 66,
    technical_optimization: 40,
    niche_coherence: 61,
    cro_principles: 34,
  },
  buyer_persona_response: {
    headline: "I'd hesitate — this feels risky for a first order.",
    quotes: [
      "The design is pretty but I don't know why it costs this much.",
      "No reviews? I've never heard of this brand.",
      "How long is shipping? I can't find it.",
    ],
    would_buy: false,
    reasons: ["No social proof", "Unclear value vs price", "Hidden shipping/returns"],
  },
  annotations: [],
  top_fixes: [
    {
      title: "Rewrite the hero to lead with desire, not the product name",
      impact: "high",
      effort: "M",
      why: "Cold visitors decide in seconds; the hero must sell the feeling, not label the product.",
    },
    {
      title: "Add review stars + count next to the price",
      impact: "high",
      effort: "S",
      why: "First-time buyers need proof others bought before they will.",
    },
    {
      title: "Surface a shipping/returns trust bar under the CTA",
      impact: "high",
      effort: "S",
      why: "Discretionary buyers abandon when the risk of buying is unclear.",
    },
    {
      title: "Cut the nav from 7 links to 4",
      impact: "medium",
      effort: "S",
      why: "Every extra nav link is an exit; fewer choices keep visitors on the buying path.",
    },
    {
      title: "Compress the hero image (2.1MB to under 300KB)",
      impact: "medium",
      effort: "M",
      why: "A slow first paint costs conversions on mobile paid traffic.",
    },
    {
      title: "Add an above-the-fold urgency signal",
      impact: "low",
      effort: "S",
      why: "A genuine, honest nudge lifts action without eroding trust.",
    },
  ],
  ad_readiness: {
    verdict: "not_ready",
    score: 38,
    summary:
      "Do not run paid traffic to this page yet; the combination of slow shipping, hidden proof and a weak CTA will burn your ad spend.",
    blockers: [
      { title: "Zero social proof / reviews", why: "An unknown brand needs reviews to prove it delivers." },
      { title: "Shipping timeline not visible", why: "Cold traffic abandons when delivery time is unclear." },
      { title: "Weak primary CTA", why: "The 'Shop now' button competes with three other links." },
    ],
  },
};

const MOCK = {
  id: "preview",
  status: "succeeded" as const,
  url: "https://luminajewelry.com",
  screenshot_url: "",
  result: RESULT,
  rewrite: null,
  meta_ads: null,
  error: null,
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  is_published: false,
  share_slug: null,
  preview_score: null,
  preview_summary: null,
};

export default function AnonRevealPreviewPage() {
  if (process.env.ENABLE_ANON_PREVIEW !== "true") notFound();
  return (
    <AnalysisView
      initial={MOCK as unknown as Parameters<typeof AnalysisView>[0]["initial"]}
      viewer={{
        canPublish: false,
        publishedSlug: null,
        fullName: null,
        isScale: false,
        isPaid: false,
        canRunMeta: false,
        metaLimit: 0,
        metaUsed: 0,
      }}
      initialSimulation={null}
      nicheWinners={{
        nicheLabel: "Jewelry",
        locked: true,
        winners: [],
        lockedCount: 3,
        scope: "niche",
      }}
      isAnon
    />
  );
}
