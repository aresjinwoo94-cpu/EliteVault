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
};

export const inngest = new Inngest({
  id: "elitevault",
  schemas: new EventSchemas().fromRecord<Events>(),
});
