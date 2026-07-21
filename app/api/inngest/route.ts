import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeWebsite } from "@/inngest/functions/analyze-website";
import { runMetaSimulationFn } from "@/inngest/functions/run-meta-simulation";
import { refreshTrends } from "@/inngest/functions/refresh-trends";
import { activationFollowup } from "@/inngest/functions/activation-followup";

/**
 * Each Inngest step is a SEPARATE invocation of this route, so this is the
 * per-step ceiling. The heavy steps — cold screenshot capture (~30-60s) and
 * the vision-AI analyzer on a tall page (~30-90s) — blow past Vercel's short
 * default function timeout, which makes Vercel return a 504 mid-step. Inngest
 * then reports "Your server returned HTTP 504 before the SDK responded" and
 * the audit fails/refunds. Cached stores return instantly so they slipped
 * through; cold/heavy URLs (e.g. a big Shopify product page) did not.
 *
 * 60s is the Vercel HOBBY maximum, so this value is safe on every plan (a
 * higher number would FAIL the build on Hobby). The default before this was
 * far lower (~10-15s) — nowhere near enough for a vision-AI call plus its
 * retries — which is why cold audits 504'd. A normal viewport screenshot
 * (~2880x1800) is a single ~20-30s Gemini call, so 60s covers it with room
 * for one retry. If the owner moves to Vercel Pro, bump this to 300 for
 * heavier headroom.
 */
export const maxDuration = 60;
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    analyzeWebsite,
    runMetaSimulationFn,
    refreshTrends,
    activationFollowup,
  ],
  streaming: "allow",
});
