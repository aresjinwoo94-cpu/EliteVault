import { EventSchemas, Inngest } from "inngest";

type Events = {
  "analysis/requested": {
    data: {
      analysisId: string;
      userId: string;
      url?: string;
      screenshotUrl?: string;
      persona?: Record<string, unknown> | null;
      runRewrite?: boolean;
    };
  };
  "meta-simulation/requested": {
    data: {
      simulationId: string;
      analysisId: string;
      userId: string;
      aovUsd: number;
      dailyBudgetUsd: number;
      productMarginPct?: number | null;
      notes?: string | null;
    };
  };
};

export const inngest = new Inngest({
  id: "elitevault",
  schemas: new EventSchemas().fromRecord<Events>(),
});
