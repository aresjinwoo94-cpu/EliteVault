import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { enterMeter } from "@/lib/usage/context";
import { runTrendScout } from "@/ai/agents/trend-scout-agent";
import { currentWeekMonday } from "@/lib/trends";

/**
 * Weekly Trends refresh — the ONLY writer of the trends cache.
 *
 * Triggers:
 *   • cron  "0 6 * * 1"  → every Monday 06:00 UTC
 *   • event "trends/refresh.requested" → manual/on-demand (operator or seed)
 *
 * Cost control: one cheap Gemini Flash call PER NICHE PER WEEK, cached for all
 * users to read. If a niche already has signals for the current week we skip
 * it (unless `force`), so re-runs are idempotent and free. There is never a
 * per-user model call.
 */
export const refreshTrends = inngest.createFunction(
  { id: "refresh-trends", name: "Refresh weekly trends", retries: 1 },
  [{ cron: "0 6 * * 1" }, { event: "trends/refresh.requested" }],
  async ({ event, step }) => {
    // Attribute every Gemini call in this job to the 'trend_refresh' bucket
    // (no user — it's a system job).
    enterMeter({ userId: null, plan: null, eventType: "trend_refresh" });

    const service = createSupabaseServiceClient();
    const week = currentWeekMonday();

    const data =
      (event as { data?: { nicheSlug?: string | null; force?: boolean } })
        .data ?? {};
    const onlySlug = data.nicheSlug ?? null;
    const force = Boolean(data.force);

    // Load target niches (all active, or a single one for a targeted refresh).
    const nichesQuery = service
      .from("niches")
      .select("id, slug, name")
      .eq("is_active", true);
    const { data: niches } = onlySlug
      ? await nichesQuery.eq("slug", onlySlug)
      : await nichesQuery;

    const results: Array<{ slug: string; status: string }> = [];

    for (const niche of (niches as
      | { id: string; slug: string; name: string }[]
      | null) ?? []) {
      const outcome = await step.run(`scout-${niche.slug}`, async () => {
        // Idempotency / cache: skip if we already have this week's data.
        if (!force) {
          const { count } = await service
            .from("trend_signals")
            .select("id", { count: "exact", head: true })
            .eq("niche_id", niche.id)
            .eq("week", week);
          if ((count ?? 0) > 0) return "cached";
        }

        const scouted = await runTrendScout({ niche: niche.name });

        if (scouted.subniches.length > 0) {
          await service.from("trend_signals").upsert(
            scouted.subniches.map((s) => ({
              niche_id: niche.id,
              item: s.item,
              kind: "subniche" as const,
              direction: s.direction,
              score: s.score,
              rationale: s.rationale,
              provenance: "estimated" as const,
              source: null,
              week,
            })),
            { onConflict: "niche_id,kind,item,week" },
          );
        }

        if (scouted.products.length > 0) {
          await service.from("products_trending").upsert(
            scouted.products.map((p) => ({
              niche_id: niche.id,
              product: p.product,
              direction: p.direction,
              score: p.score,
              rationale: p.rationale,
              provenance: "estimated" as const,
              source: null,
              week,
            })),
            { onConflict: "niche_id,product,week" },
          );
        }

        return "refreshed";
      });

      results.push({ slug: niche.slug, status: outcome });

      // Gentle pacing on top of the provider's own key-rotation backoff.
      if (outcome === "refreshed") {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    return { week, count: results.length, results };
  },
);
