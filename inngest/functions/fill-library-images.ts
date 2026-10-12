import { inngest } from "../client";
import { pickMissingImageRows, fillOneImage, type FillOutcome } from "@/lib/library/images";

/**
 * Library image job — LOW PRIORITY, isolated from the Analyzer (WP-L1, brief
 * oct-2026 §L.3 #5). Gets a real hero image for Library rows that lack one and
 * lets the ones that then pass the publication gate publish themselves.
 *
 * Isolation: concurrency 1 (never parallel with itself), a handful of stores
 * per run, one store per step, a pause between stores, and ONLY the free
 * keyless providers (see lib/library/images.ts) — it cannot consume the
 * Analyzer's ScreenshotOne quota or Microlink's per-IP cap.
 *
 * Cadence: every 4 hours is plenty — rows only appear in weekly batches and
 * most runs find nothing to do (and cost nothing).
 */
const PER_RUN = 5;
const PAUSE = "4s";

export const fillLibraryImages = inngest.createFunction(
  {
    id: "fill-library-images",
    name: "Library: fetch real images for stores without one",
    retries: 0,
    concurrency: { limit: 1 },
  },
  [{ cron: "0 */4 * * *" }, { event: "library/images.requested" }],
  async ({ event, step }) => {
    const limit = Math.min(
      12,
      Math.max(1, (event as { data?: { limit?: number } }).data?.limit ?? PER_RUN),
    );
    const rows = await step.run("pick", () => pickMissingImageRows(limit));
    const outcomes: FillOutcome[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) await step.sleep(`pause-${i}`, PAUSE);
      outcomes.push(await step.run(`fill-${rows[i].id}`, () => fillOneImage(rows[i])));
    }
    return {
      attempted: rows.length,
      filled: outcomes.filter((o) => o.ok).length,
      republished: outcomes.filter((o) => o.published).length,
      failed: outcomes.filter((o) => !o.ok).map((o) => `${o.domain}: ${o.note}`),
    };
  },
);
