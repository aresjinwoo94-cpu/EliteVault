import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import {
  buildAbandonedCheckout,
  type AbandonedCheckoutStep,
} from "@/lib/email/abandoned-checkout";
import { buildUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { PLANS } from "@/lib/stripe/plans";
import { decideRecoveryAction } from "@/lib/checkout/recovery-logic";

/**
 * Abandoned-checkout recovery (Part 2). Fired by `checkout/started` when a user
 * opens a subscription checkout. Durable sleeps send up to three reminder
 * emails (~1h / ~24h / ~72h from creation). Before EVERY send it re-checks
 * whether the user has since converted or unsubscribed, and stops if so.
 *
 * Best-effort like activation-followup: sendEmail no-ops without RESEND_API_KEY
 * (the job still succeeds). Idempotent per step via checkout_recovery.emails_sent
 * so an Inngest retry never double-sends the same reminder.
 */

type StopResult = { stop: boolean; reason?: string; emailed?: boolean };

async function markRecovered(
  service: ReturnType<typeof createSupabaseServiceClient>,
  sessionId: string,
) {
  await service
    .from("checkout_recovery")
    .update({ status: "recovered", recovered_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .neq("status", "recovered");
}

/** Re-check conversion/unsub, then send step N if still due. Runs in a step. */
async function sendRecoveryStep(
  event: {
    sessionId: string;
    userId: string;
    email: string;
    plan: "pro" | "scale";
    interval: "month" | "year";
  },
  stepNo: AbandonedCheckoutStep,
): Promise<StopResult> {
  const service = createSupabaseServiceClient();
  const { sessionId, userId, email, plan, interval } = event;

  // Gather current state: conversion signals + the sequence row.
  const { data: profile } = await service
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();
  const currentPlan = (profile as { plan?: string } | null)?.plan ?? "free";

  const { data: subs } = await service
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .limit(1);
  const hasActiveSubscription = Array.isArray(subs) && subs.length > 0;

  const { data: row } = await service
    .from("checkout_recovery")
    .select("status, emails_sent")
    .eq("session_id", sessionId)
    .single();
  const r = row as
    | { status?: "pending" | "recovered" | "unsubscribed"; emails_sent?: number }
    | null;

  // Pure decision (unit-tested in recovery-logic).
  const decision = decideRecoveryAction(
    {
      currentPlan,
      hasActiveSubscription,
      rowStatus: r?.status ?? null,
      emailsSent: r?.emails_sent ?? 0,
    },
    stepNo,
  );

  if (decision.action === "stop") {
    if (decision.recovered) await markRecovered(service, sessionId);
    return { stop: true, reason: decision.reason };
  }
  if (decision.action === "skip") {
    return { stop: false, reason: decision.reason };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";
  const recoveryUrl = `${appUrl}/app/checkout?plan=${plan}&interval=${interval}`;
  const unsubscribeUrl = buildUnsubscribeUrl(sessionId, appUrl);
  const price = PLANS[plan]?.price.month ?? 0;

  const { subject, html } = buildAbandonedCheckout({
    plan,
    price,
    recoveryUrl,
    unsubscribeUrl,
    step: stepNo,
    appUrl,
  });
  const sent = await sendEmail({
    to: email,
    subject,
    html,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
  });

  if (sent.ok) {
    await service
      .from("checkout_recovery")
      .update({ emails_sent: stepNo, last_email_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  }
  return { stop: false, emailed: sent.ok };
}

export const checkoutRecovery = inngest.createFunction(
  { id: "checkout-recovery", name: "Abandoned checkout recovery", retries: 2 },
  { event: "checkout/started" },
  async ({ event, step }) => {
    const data = event.data;

    // Register the sequence (idempotent — a retried checkout reuses the row).
    await step.run("register", async () => {
      const service = createSupabaseServiceClient();
      await service.from("checkout_recovery").upsert(
        {
          session_id: data.sessionId,
          user_id: data.userId,
          email: data.email,
          plan: data.plan,
          interval: data.interval,
          status: "pending",
        },
        { onConflict: "session_id", ignoreDuplicates: true },
      );
      return { registered: true };
    });

    // Step 1 — ~1h after checkout opened.
    await step.sleep("wait-step-1", "1h");
    const s1 = await step.run("check-and-send-1", () => sendRecoveryStep(data, 1));
    if (s1.stop) return s1;

    // Step 2 — ~24h from creation (23h more).
    await step.sleep("wait-step-2", "23h");
    const s2 = await step.run("check-and-send-2", () => sendRecoveryStep(data, 2));
    if (s2.stop) return s2;

    // Step 3 — ~72h from creation (48h more).
    await step.sleep("wait-step-3", "48h");
    const s3 = await step.run("check-and-send-3", () => sendRecoveryStep(data, 3));
    return s3;
  },
);
