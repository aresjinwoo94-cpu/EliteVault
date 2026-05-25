import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeWebsite } from "@/inngest/functions/analyze-website";
import { runMetaSimulationFn } from "@/inngest/functions/run-meta-simulation";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeWebsite, runMetaSimulationFn],
  streaming: "allow",
});
