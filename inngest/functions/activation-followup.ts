import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { buildActivation } from "@/lib/email/activation";

/**
 * Activation follow-up (Phase 5). Fired by `activation/first-value` the first
 * time a user reaches a successful audit. Waits a few days (durable sleep),
 * then emails them to come back for the SECOND audit — the moment that turns
 * a trial into a habit — measuring whether their score moved since.
 *
 * Sent at most once (gated by profiles.activation_emailed_at). No model calls.
 */
const FOLLOWUP_DELAY = "3d";

export const activationFollowup = inngest.createFunction(
  { id: "activation-followup", name: "Activation follow-up email", retries: 2 },
  { event: "activation/first-value" },
  async ({ event, step }) => {
    const { userId, score } = event.data;

    await step.sleep("activation-wait", FOLLOWUP_DELAY);

    return await step.run("send-followup", async () => {
      const service = createSupabaseServiceClient();

      const { data: profile } = await service
        .from("profiles")
        .select("email, activation_emailed_at")
        .eq("id", userId)
        .single();
      const email = (profile as { email?: string } | null)?.email ?? null;
      const alreadyEmailed = (
        profile as { activation_emailed_at?: string | null } | null
      )?.activation_emailed_at;
      if (!email || alreadyEmailed) return { skipped: true as const };

      // Most recent successful audit score → did it improve since the first?
      const { data: latest } = await service
        .from("analyses")
        .select("result")
        .eq("user_id", userId)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1);
      const latestScore =
        (latest as { result?: { score?: number } }[] | null)?.[0]?.result
          ?.score ?? null;

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";
      const { subject, html } = buildActivation({
        firstScore: score,
        latestScore,
        appUrl,
      });
      const sent = await sendEmail({ to: email, subject, html });

      if (sent.ok) {
        await service
          .from("profiles")
          .update({ activation_emailed_at: new Date().toISOString() })
          .eq("id", userId);
      }
      return { emailed: sent.ok };
    });
  },
);
