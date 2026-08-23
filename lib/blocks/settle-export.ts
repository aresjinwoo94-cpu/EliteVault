import "server-only";
import type Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Liquid Blocks WP-D — record a paid export.
 *
 * # Why this is NOT in app/actions/blocks-export.ts
 * It used to be, and that was a security hole rather than a style problem.
 * EVERY exported async function in a `"use server"` module is a public HTTP
 * endpoint — Next registers one server-reference id per export. This function
 * takes a Stripe session as its ARGUMENT, does no authentication, and writes
 * with the service-role client, so anyone who could reach it could POST a
 * forged session object naming their own project and user id and grant
 * themselves a paid export. Both ids are trivially known to them: the project
 * id is in their own URL and the user id is in their own session.
 *
 * The RLS on `blocks_exports` (migration 0035, SELECT-only) is what stops a
 * client from forging a paid row directly, and it was correct — but the
 * service-role client exists precisely to bypass RLS, so exposing a
 * service-role write as an action walked straight around it. Only the fact
 * that the reference id wasn't in a client chunk stood in the way, and that is
 * obscurity: the id is a deterministic build artifact, stable across deploys,
 * and it ships the moment any client component imports the function.
 *
 * A plain server-only module has no such surface. The webhook and the eager
 * confirmation both import it directly, in-process.
 */

/**
 * Write the paid row for a completed Checkout Session.
 *
 * Idempotent on `stripe_session_id`, which is what makes "the same session
 * arriving twice under two different event ids" a no-op — a guarantee the
 * webhook's event-level dedupe cannot provide, and the one that also makes the
 * eager confirmation safe to race against the webhook.
 *
 * Throws on a write failure, deliberately: the caller decides what to do, and
 * both callers treat it as serious because the customer's money is already
 * gone.
 */
export async function settleExport(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {};
  const projectId = meta.blocks_project_id;
  const userId = meta.supabase_user_id;
  if (meta.purchase !== "liquid_export" || !projectId || !userId) return;

  /**
   * Checked on BOTH settlement paths, not just the eager one.
   *
   * `checkout.session.completed` cannot currently arrive unpaid — every
   * configured payment method is synchronous and there is no 100%-off promo
   * code — so this is not exploitable today. It becomes a free-export hole the
   * day someone enables ACH, SEPA, Klarna or a promotion code, and the person
   * making that change in the Stripe dashboard has no reason to think about
   * this file.
   */
  if (session.payment_status !== "paid") {
    console.warn(
      `[blocks] refusing to settle session ${session.id}: payment_status=${session.payment_status}`,
    );
    return;
  }

  const service = createSupabaseServiceClient();
  // `as any`: post-0001 tables resolve to `never` under the stale Database
  // type. See app/actions/blocks.ts.
  const { error } = await (service.from("blocks_exports") as any).upsert(
    {
      project_id: projectId,
      user_id: userId,
      stripe_session_id: session.id,
      status: "paid",
      amount_total: session.amount_total ?? null,
      currency: session.currency?.toUpperCase() ?? null,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_session_id" },
  );

  if (error) {
    /**
     * A second paid row for a project that already has one. The partial unique
     * index in migration 0036 makes a concurrent double-purchase impossible to
     * store rather than merely unlikely — two tabs opened before either paid
     * would otherwise both pass the `ALREADY_PAID` read and both charge.
     *
     * Storing it isn't the point; NOT losing it is. The customer has been
     * charged twice and is owed a refund, so this logs everything needed to
     * issue one by hand and does not fail the webhook — the export is already
     * unlocked by the first row, and a 500 here would only make Stripe retry
     * something that can never succeed.
     */
    if (error.code === "23505") {
      console.error(
        `[blocks] DOUBLE PURCHASE — refund owed. session=${session.id} project=${projectId} user=${userId} amount=${session.amount_total} ${session.currency}`,
      );
      return;
    }
    // Loud: the customer has paid and cannot download. The session id is what
    // makes this reconcilable by hand.
    console.error(
      `[blocks] PAID EXPORT NOT RECORDED — session ${session.id}, project ${projectId}: ${error.message}`,
    );
    throw new Error(error.message);
  }
}
