import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { enterMeter } from "@/lib/usage/context";
import { captureScreenshot } from "@/lib/screenshot";
import { runQuickScore } from "@/ai/agents/quick-score-agent";
import { currentWeekMonday } from "@/lib/trends";
import { sendEmail } from "@/lib/email/resend";
import { buildDigest, type DigestStore } from "@/lib/email/digest";
import type { PlanTier } from "@/lib/supabase/types";

/**
 * Weekly monitoring re-audit + digest (Phase 3).
 *
 * Triggers:
 *   • cron  "0 7 * * 1"  → Monday 07:00 UTC (after the Trends refresh at 06:00)
 *   • event "monitoring/reaudit.requested" → manual / single-user testing
 *
 * For each active monitored store we run a CHEAP Flash quick-score (reusing
 * the screenshot + scoring components — NOT the full Analyzer pipeline, to
 * keep COGS flat and leave the Analyzer untouched), snapshot the score, then
 * email each user one digest of what moved (own store + competitors).
 *
 * Idempotent: a store already scored for the current week is skipped.
 */
type StoreRow = {
  id: string;
  user_id: string;
  url: string;
  domain: string;
  label: string | null;
  kind: "self" | "competitor";
};

export const weeklyReaudit = inngest.createFunction(
  { id: "weekly-reaudit", name: "Weekly monitoring re-audit + digest", retries: 1 },
  [{ cron: "0 7 * * 1" }, { event: "monitoring/reaudit.requested" }],
  async ({ event, step }) => {
    const service = createSupabaseServiceClient();
    const week = currentWeekMonday();
    const onlyUser =
      (event as { data?: { userId?: string | null } }).data?.userId ?? null;

    let storeQuery = service
      .from("monitored_stores")
      .select("id, user_id, url, domain, label, kind")
      .eq("is_active", true);
    if (onlyUser) storeQuery = storeQuery.eq("user_id", onlyUser);
    const { data: stores } = await storeQuery;

    // Group stores by user.
    const byUser = new Map<string, StoreRow[]>();
    for (const s of (stores as StoreRow[] | null) ?? []) {
      const list = byUser.get(s.user_id) ?? [];
      list.push(s);
      byUser.set(s.user_id, list);
    }

    const summary: Array<{ userId: string; stores: number; emailed: boolean }> = [];

    for (const [userId, userStores] of byUser) {
      const { data: profile } = await service
        .from("profiles")
        .select("email, plan")
        .eq("id", userId)
        .single();
      const email = (profile as { email?: string } | null)?.email ?? null;
      const plan = (profile as { plan?: PlanTier } | null)?.plan ?? null;

      // Attribute this user's quick-score calls to them for the cost ledger.
      enterMeter({ userId, plan, eventType: "monitor_reaudit" });

      const digestStores: DigestStore[] = [];

      for (const store of userStores) {
        const res = await step.run(`score-${store.id}-${week}`, async () => {
          // Cache / idempotency: skip if already scored this week.
          const { data: existing } = await service
            .from("score_snapshots")
            .select("score")
            .eq("monitored_store_id", store.id)
            .eq("week", week)
            .limit(1);
          if (existing && (existing as { score: number }[])[0]) {
            return {
              score: (existing as { score: number }[])[0].score,
              prev: null as number | null,
            };
          }

          // Cheap re-score: screenshot + Flash quick-score.
          let score: number | null = null;
          try {
            const shot = await captureScreenshot(store.url);
            const qs = await runQuickScore({
              screenshotBase64: shot.base64,
              mediaType: shot.mediaType,
              url: store.url,
            });
            score = qs?.score ?? null;
          } catch (err) {
            console.warn(
              `[weekly-reaudit] score failed for ${store.url}:`,
              (err as Error).message,
            );
          }
          if (score === null) return { score: null, prev: null as number | null };

          // Previous score = most recent snapshot before this week.
          const { data: prevRows } = await service
            .from("score_snapshots")
            .select("score")
            .eq("monitored_store_id", store.id)
            .lt("week", week)
            .order("week", { ascending: false })
            .limit(1);
          const prev =
            (prevRows as { score: number }[] | null)?.[0]?.score ?? null;

          await service.from("score_snapshots").upsert(
            { monitored_store_id: store.id, user_id: userId, score, week },
            { onConflict: "monitored_store_id,week" },
          );
          await service
            .from("monitored_stores")
            .update({ last_score: score, last_audited_at: new Date().toISOString() })
            .eq("id", store.id);

          return { score, prev };
        });

        digestStores.push({
          label: store.label ?? store.domain,
          url: store.url,
          kind: store.kind,
          score: res.score,
          prevScore: res.prev,
          delta:
            res.score !== null && res.prev !== null
              ? res.score - res.prev
              : null,
        });

        await new Promise((r) => setTimeout(r, 1200)); // gentle pacing
      }

      let emailed = false;
      if (email && digestStores.length > 0) {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";
        const { subject, html } = buildDigest({ stores: digestStores, week, appUrl });
        const sent = await step.run(`digest-${userId}-${week}`, async () =>
          sendEmail({ to: email, subject, html }),
        );
        emailed = sent.ok;
      }

      summary.push({ userId, stores: userStores.length, emailed });
    }

    return { week, users: summary.length, summary };
  },
);
