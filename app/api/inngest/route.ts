import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeWebsite } from "@/inngest/functions/analyze-website";
import { runMetaSimulationFn } from "@/inngest/functions/run-meta-simulation";
import { refreshTrends } from "@/inngest/functions/refresh-trends";
import { refreshLibrary } from "@/inngest/functions/refresh-library";
import { activationFollowup } from "@/inngest/functions/activation-followup";
import { checkoutRecovery } from "@/inngest/functions/checkout-recovery";
import { blocksPreview } from "@/inngest/functions/blocks-preview";

/**
 * Each Inngest step is a SEPARATE invocation of this route, so this is the
 * per-step ceiling. The heavy steps — cold screenshot capture (~30-60s) and
 * the vision-AI analyzer on a tall page (~30-90s) — blow past Vercel's short
 * default function timeout, which makes Vercel return a 504 mid-step. Inngest
 * then reports "Your server returned HTTP 504 before the SDK responded" and
 * the audit fails/refunds. Cached stores return instantly so they slipped
 * through; cold/heavy URLs (e.g. a big Shopify product page) did not.
 *
 * Raised 60 → 300 for Liquid Blocks (WP-B). Its preview step launches a real
 * headless Chromium, loads a live storefront, reads its computed styles,
 * injects a block and takes two screenshots — none of which fits in 60s from a
 * cold start, and none of which the Analyzer's provider chain can do at all.
 *
 * 60 used to be the ceiling because it is the Vercel HOBBY maximum for the
 * classic runtime and a higher number failed the build there. With Fluid
 * Compute — already assumed elsewhere in this repo (see the comment in
 * next.config.mjs) — 300s is available on Hobby and Pro alike, and the owner
 * has confirmed this project is on Pro.
 *
 * This does NOT change the Analyzer's behaviour. Its budgets are set
 * independently in lib/deadline.ts (ANALYZER_STEP_BUDGET_MS, default 50s) and
 * lib/screenshot-core.ts (SCREENSHOT_BUDGET_MS, default 45s), both unchanged —
 * so audits still fail cleanly at the same points they did before. All this
 * raises is the platform ceiling above them, which can only turn a 504 into a
 * real error message.
 *
 * If this ever needs to go back down, 60 is safe for everything except Blocks,
 * whose previews would then fail with a timeout rather than corrupt anything.
 */
export const maxDuration = 300;
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    analyzeWebsite,
    runMetaSimulationFn,
    refreshTrends,
    refreshLibrary,
    activationFollowup,
    checkoutRecovery,
    blocksPreview,
  ],
  streaming: "allow",
});
