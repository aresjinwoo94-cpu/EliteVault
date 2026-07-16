import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeWebsite } from "@/inngest/functions/analyze-website";
import { runMetaSimulationFn } from "@/inngest/functions/run-meta-simulation";
import { refreshTrends } from "@/inngest/functions/refresh-trends";
import { activationFollowup } from "@/inngest/functions/activation-followup";

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
