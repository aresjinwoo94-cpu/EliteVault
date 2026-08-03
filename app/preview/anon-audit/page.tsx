import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AnonAnalysisView,
  type AnonAudit,
} from "@/components/analyzer/anon-analysis-view";

/**
 * Design preview of the enriched anonymous audit reveal.
 *
 * The real anonymous audit is single-use (rate-limited to 1/day per IP), so
 * this gives the team a way to eyeball the full reveal design on demand with
 * representative mock data — no AI spend, no burning the daily audit.
 *
 * Gated behind ENABLE_ANON_PREVIEW so it never renders in production unless
 * explicitly turned on (set it in the Vercel Preview environment to view it on
 * a deploy). Always noindex + robots-disallowed regardless.
 */
export const metadata: Metadata = {
  title: "Anon reveal preview (internal)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const MOCK: AnonAudit = {
  id: "preview",
  status: "succeeded",
  url: "https://luminajewelry.com",
  screenshot_url: "",
  error: null,
  preview_score: null,
  preview_summary: null,
  score: 45,
  summary:
    "Your store looks polished but reads as risky to a first-time buyer: the hero doesn't say what makes the jewelry worth the price, there's no visible social proof above the fold, and shipping/returns are buried. Cold visitors bounce before they trust you.",
  annotations: [],
  category_scores: {
    color_integration: 72,
    layout_proportion: 58,
    image_quality: 66,
    technical_optimization: 40,
    niche_coherence: 61,
    cro_principles: 34,
  },
  ad_readiness: {
    verdict: "not_ready",
    score: 38,
    summary:
      "This page isn't ready for cold Meta traffic yet. Buyers land with no reason to trust a new brand and no urgency to act, so paid clicks will mostly bounce.",
    blockers: [
      {
        title: "No social proof above the fold",
        why: "First-time buyers need to see other people bought before they will.",
      },
      {
        title: "Shipping & returns not visible",
        why: "Discretionary buyers abandon when the risk of buying is unclear.",
      },
      {
        title: "Weak primary CTA",
        why: "The 'Shop now' button competes with three other links; nothing pulls the eye.",
      },
    ],
  },
  fixes: [
    { title: "Rewrite the hero to lead with desire, not the product name", impact: "high" },
    { title: "Add review stars + count next to the price", impact: "high" },
    { title: "Surface a shipping/returns trust bar under the CTA", impact: "high" },
    { title: "Cut the nav from 7 links to 4", impact: "medium" },
    { title: "Compress the hero image (2.1MB to under 300KB)", impact: "medium" },
    { title: "Add an above-the-fold urgency signal", impact: "low" },
  ],
  fixes_total: 6,
};

export default function AnonRevealPreviewPage() {
  if (process.env.ENABLE_ANON_PREVIEW !== "true") notFound();
  return <AnonAnalysisView initial={MOCK} />;
}
