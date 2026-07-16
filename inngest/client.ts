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
      // P1.1 — when true, the analyzer agent uses the cheap/fast model
      // tier (Gemini Flash-Lite). Optional so older queued events without
      // the field still validate (treated as premium / not-fast).
      fast?: boolean;
      // Plan snapshot for inference-cost metering (usage_events). Optional so
      // older queued events still validate (recorded as unattributed plan).
      plan?: string | null;
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
      // Plan snapshot for inference-cost metering (usage_events).
      plan?: string | null;
      // v3.2 — realism inputs. Strings (not unions) at the event boundary
      // so older queued events don't fail strict typing. Validated by the
      // server action before the event is sent.
      country?: string | null;
      productType?: string | null;
      competitiveness?: string | null;
      notes?: string | null;
    };
  };
  // Phase 2 — manual trigger to refresh the weekly Trends cache on demand
  // (the same function also runs on a weekly cron). Optional fields let an
  // operator target a single niche or force a re-run of the current week.
  "trends/refresh.requested": {
    data: {
      nicheSlug?: string | null;
      force?: boolean;
    };
  };
  // Phase 5 — fired the first time a user gets a successful audit. Kicks off
  // the delayed activation follow-up email.
  "activation/first-value": {
    data: {
      userId: string;
      analysisId: string;
      score: number;
      plan?: string | null;
    };
  };
};

export const inngest = new Inngest({
  id: "elitevault",
  schemas: new EventSchemas().fromRecord<Events>(),
});
