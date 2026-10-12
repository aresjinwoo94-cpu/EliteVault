import { EventSchemas, Inngest } from "inngest";

type Events = {
  "analysis/requested": {
    data: {
      analysisId: string;
      // Null for an ANONYMOUS (pre-login) audit — the activation-funnel Tarea 1
      // flow. The pipeline skips the owner-only steps (credit refund on failure,
      // first-value email) when userId is null.
      userId: string | null;
      // Set only for anonymous audits: the session token that ties the audit to
      // the browser (for claiming it on sign-up). Absent for owned audits.
      anonId?: string | null;
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
      // Language the audit text is written in ("en" | "es"). Optional so older
      // queued events still validate (treated as English).
      locale?: string | null;
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
  // Library — manual trigger to refresh liveness + momentum on demand (the
  // same function also runs on a weekly cron). Optional fields let an operator
  // tune the chunk sizes for a targeted or heavier run.
  "library/refresh.requested": {
    data: {
      verifyChunk?: number;
      momentumChunk?: number;
      maxChunks?: number;
    };
  };
  // Library — manual trigger for the low-priority image job (same function
  // also runs on a cron). Optional `limit` = stores to attempt this run.
  "library/images.requested": {
    data: { limit?: number };
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
  // Part 2 — fired when a user opens a subscription checkout, to drive the
  // abandoned-checkout recovery sequence if they don't complete payment.
  "checkout/started": {
    data: {
      sessionId: string;
      userId: string;
      email: string;
      plan: "pro" | "scale";
      interval: "month" | "year";
    };
  };
};

export const inngest = new Inngest({
  id: "elitevault",
  schemas: new EventSchemas().fromRecord<Events>(),
});
