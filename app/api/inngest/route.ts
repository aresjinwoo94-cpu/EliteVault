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
 * 300s is the Vercel Pro maximum. On Hobby the platform clamps to its own max
 * (60s) — if audits still 504 there, the project needs Vercel Pro (or a
 * smaller capture; see lib/screenshot-core.ts).
 */
export const maxDuration = 300;
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
