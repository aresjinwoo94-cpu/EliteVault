import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeWebsite } from "@/inngest/functions/analyze-website";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeWebsite],
  streaming: "allow",
});
