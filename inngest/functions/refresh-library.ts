import { inngest } from "../client";
import { verifyBatch, momentumBatch } from "@/lib/library/refresh";

/**
 * Weekly Library refresh — keeps the "Winners in your niche" module honest.
 *
 * Triggers:
 *   • cron  "0 5 * * 0"  → every Sunday 05:00 UTC (a different slot from the
 *     Monday trends refresh, so the two system jobs don't overlap). Feeds a
 *     freshly-verified Library into the week.
 *   • event "library/refresh.requested" → manual/on-demand.
 *
 * Two passes, each swept in chunks:
 *   1. VERIFY   probe liveness, run the publication gate, promote/demote.
 *   2. MOMENTUM refresh Meta ad counts (when a token is configured), the
 *               revenue range and the momentum score the module sorts on.
 *
 * Each chunk is its own `step.run`, i.e. a fresh <60s Vercel invocation — so
 * the whole ~90-row Library is swept well within limits, with Inngest handling
 * retries. Both passes read the STALEST rows first and stamp them, so chunks
 * advance through the table automatically and re-runs are idempotent.
 *
 * Cadence is weekly on purpose: these are established brands whose ad volume is
 * stable week-to-week, and every figure is labelled "est.". Weekly keeps the
 * Meta API usage low and works even on Vercel Hobby (daily-or-less crons). To
 * go daily later, change the cron to "0 5 * * *".
 */

// Chunk sizes chosen to stay comfortably inside one 60s step. Verify is mostly
// parallel HTTP probes; momentum's Meta lookups are serial + rate-limited, so
// its chunk is smaller. maxChunks caps total work per run (8 × 25 = 200 rows),
// far above the current Library size — the passes stop early once swept.
const VERIFY_CHUNK = 25;
const MOMENTUM_CHUNK = 20;
const MAX_CHUNKS = 8;

export const refreshLibrary = inngest.createFunction(
  { id: "refresh-library", name: "Refresh Library liveness + momentum", retries: 1 },
  [{ cron: "0 5 * * 0" }, { event: "library/refresh.requested" }],
  async ({ event, step }) => {
    const data =
      (event as { data?: { verifyChunk?: number; momentumChunk?: number; maxChunks?: number } })
        .data ?? {};
    const verifyChunk = data.verifyChunk ?? VERIFY_CHUNK;
    const momentumChunk = data.momentumChunk ?? MOMENTUM_CHUNK;
    const maxChunks = data.maxChunks ?? MAX_CHUNKS;

    const totals = { verified: 0, published: 0, review: 0, offline: 0, momentum: 0, metaHits: 0 };

    // Pass 1 — verify. Sweep until a chunk comes back short (table exhausted).
    for (let i = 0; i < maxChunks; i++) {
      const r = await step.run(`verify-${i}`, () => verifyBatch(verifyChunk));
      totals.verified += r.processed;
      totals.published += r.published;
      totals.review += r.review;
      totals.offline += r.offline;
      if (r.processed < verifyChunk) break;
    }

    // Pass 2 — momentum. Same sweep-until-short pattern.
    for (let i = 0; i < maxChunks; i++) {
      const r = await step.run(`momentum-${i}`, () => momentumBatch(momentumChunk));
      totals.momentum += r.processed;
      totals.metaHits += r.metaHits;
      if (r.processed < momentumChunk) break;
    }

    return totals;
  },
);
