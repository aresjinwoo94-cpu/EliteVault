"use server";

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/utils";
import {
  EXPORT_NOT_CONFIGURED,
  exportPriceId,
  getExportPrice,
  type ExportPrice,
} from "@/lib/blocks/export-pricing";
import { generateLiquidBlock } from "@/ai/agents/liquid-block-agent";
import { installGuide, installGuideText } from "@/lib/blocks/install-instructions";

import { runWithMeter } from "@/lib/usage/context";
import type { BlockSpecInput } from "@/lib/blocks/catalog";
import { applyTokenOverrides, type DesignTokens } from "@/lib/blocks/design-tokens";
import type { BlocksProduct } from "@/lib/blocks/product-json";

/**
 * Liquid Blocks WP-D — the paywall.
 *
 * # The rule the whole work package exists to hold
 * The Liquid is generated and returned by `exportLiquid`, and ONLY after this
 * module has read a paid row out of the database. Nothing else in the feature
 * ever produces a snippet: the preview pipeline renders the block inside a
 * headless browser and ships two JPEGs, and the polling endpoint returns no
 * column that could carry markup. There is deliberately nothing to leak,
 * because a paywall you can open with devtools is decoration.
 *
 * # Nothing here touches credits
 * The brief specified 10 credits per export; the owner overrode it. Credits are
 * the audit currency, and charging the download from that pool would lock it
 * away from the Free user standing at the exact moment of highest intent — and
 * quietly eat a paying merchant's audits. See migration 0035 for the full note.
 * There is no read, no deduction and no refund of profiles.credits in this
 * file, and a test asserts it stays that way.
 *
 * # Why payment is confirmed twice, from two directions
 * The webhook is the normal path. But the failure it can't rule out is the
 * expensive one: a customer's money is taken and the row that unlocks their
 * download never gets written. So `confirmExportPayment` asks Stripe directly,
 * from the return page, and either path alone is sufficient. Both converge on
 * the same row because `stripe_session_id` is unique.
 */

export type ExportGateResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; code?: string };

export type ExportLiquidResult =
  | { ok: true; liquid: string; install: string[]; installText: string; source: string }
  | { ok: false; error: string; code?: string };

export interface ExportStatus {
  paid: boolean;
  configured: boolean;
  price: ExportPrice | null;
}

interface ProjectRow {
  id: string;
  product_url: string;
  product_json: (BlocksProduct & { currency: string | null }) | null;
  design_tokens: DesignTokens | null;
  token_overrides: Record<string, string> | null;
  block_spec: BlockSpecInput | null;
  status: string;
}

/** Load the project, scoped to the caller. Returns null when it isn't theirs. */
async function loadProject(
  projectId: string,
  userId: string,
): Promise<ProjectRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("blocks_projects")
    .select(
      "id, product_url, product_json, design_tokens, token_overrides, block_spec, status",
    )
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  return (data as unknown as ProjectRow) ?? null;
}

/** True when this project has a settled purchase against it. */
async function hasPaidExport(projectId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("blocks_exports")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "paid")
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * What the export button should say. Safe to call on every render — the price
 * is cached per lambda and the paid check is one indexed row.
 */
export async function getExportStatus(projectId: string): Promise<ExportStatus> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { paid: false, configured: false, price: null };

  const [paid, price] = await Promise.all([
    hasPaidExport(projectId, user.id),
    getExportPrice(),
  ]);
  return { paid, configured: price !== null, price };
}

/**
 * Open a Stripe Checkout session for this project's export.
 *
 * `mode: "payment"` — a one-time purchase, not a subscription. Embedded, like
 * the plan checkout, so the payment happens inside our own page.
 */
export async function startExportCheckout(
  projectId: string,
): Promise<ExportGateResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const priceId = exportPriceId();
  if (!priceId) {
    return { ok: false, error: EXPORT_NOT_CONFIGURED, code: "NOT_CONFIGURED" };
  }

  const project = await loadProject(projectId, user.id);
  if (!project) return { ok: false, error: "Project not found" };
  if (!project.block_spec) {
    return {
      ok: false,
      error: "Build a block first — there's nothing to export yet.",
      code: "NO_BLOCK",
    };
  }

  // Already bought. Charging twice for the same project would be indefensible,
  // and the UI can simply take them to the download.
  if (await hasPaidExport(projectId, user.id)) {
    return { ok: false, error: "You've already bought this one.", code: "ALREADY_PAID" };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      // Back to the project itself. The page confirms the payment eagerly from
      // this id, so the download works even if the webhook never arrives.
      return_url: absoluteUrl(
        `/app/liquid/${projectId}?checkout={CHECKOUT_SESSION_ID}`,
      ),
      // Read by both confirmation paths, and the only record tying a Stripe
      // payment back to a project if the table ever has to be rebuilt.
      metadata: {
        supabase_user_id: user.id,
        blocks_project_id: projectId,
        purchase: "liquid_export",
      },
      payment_method_types: ["card", "amazon_pay", "cashapp", "link"],
      locale: "auto",
      customer_email: user.email ?? undefined,
    });

    if (!session.client_secret) {
      return { ok: false, error: "Stripe didn't return a checkout session." };
    }

    // Best-effort trace of an unfinished purchase. Confirmation upserts on the
    // session id, so this failing costs nothing but the record.
    const service = createSupabaseServiceClient();
    // `as any`: post-0001 tables resolve to `never` under the stale Database
    // type. See app/actions/blocks.ts.
    await (service.from("blocks_exports") as any)
      .insert({
        project_id: projectId,
        user_id: user.id,
        stripe_session_id: session.id,
        status: "pending",
      })
      .then(
        () => undefined,
        (err: unknown) =>
          console.warn("[blocks] pending export row failed:", (err as Error).message),
      );

    return { ok: true, clientSecret: session.client_secret };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "checkout_failed";
    console.error("[blocks] export checkout failed:", msg);
    return { ok: false, error: "We couldn't open the payment form. Try again." };
  }
}

/**
 * Settle a payment from the session id Stripe hands back on return.
 *
 * Deliberately independent of the webhook. If a delivery is lost, delayed, or
 * fails after `stripe_events` has already recorded the event id — at which
 * point Stripe's retry is deduped away — this is what still unlocks the
 * download the customer has paid for.
 *
 * Exported for the webhook to reuse, so both paths apply identical rules.
 */
export async function confirmExportPayment(
  projectId: string,
  sessionId: string,
): Promise<{ ok: boolean; paid: boolean }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, paid: false };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.warn("[blocks] could not retrieve session:", (err as Error).message);
    return { ok: false, paid: false };
  }

  // Everything is checked against STRIPE's copy of the session, never against
  // what the browser sent us. A session id in a URL is a guessable-ish string
  // from the client, so the project and the buyer both have to match the
  // metadata Stripe recorded at creation time.
  const meta = session.metadata ?? {};
  if (
    meta.purchase !== "liquid_export" ||
    meta.blocks_project_id !== projectId ||
    meta.supabase_user_id !== user.id
  ) {
    return { ok: false, paid: false };
  }
  if (session.payment_status !== "paid") {
    return { ok: true, paid: false };
  }

  await settleExport(session);
  return { ok: true, paid: true };
}

/**
 * Write the paid row. Shared by the return page and the webhook.
 *
 * Idempotent on `stripe_session_id`, which is what makes "the same session
 * arriving twice under two different event ids" a no-op — a guarantee the
 * webhook's own event-level dedupe cannot provide.
 */
export async function settleExport(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {};
  const projectId = meta.blocks_project_id;
  const userId = meta.supabase_user_id;
  if (!projectId || !userId) return;

  const service = createSupabaseServiceClient();
  // `as any`: see the note above.
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
    // Loud: the customer has paid and cannot download. Surfacing the session id
    // is what makes this reconcilable by hand.
    console.error(
      `[blocks] PAID EXPORT NOT RECORDED — session ${session.id}, project ${projectId}: ${error.message}`,
    );
    throw new Error(error.message);
  }
}

/**
 * Hand over the code. The one function in the feature that returns Liquid.
 */
export async function exportLiquid(projectId: string): Promise<ExportLiquidResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // THE GATE. Before anything is generated, before anything is read, and never
  // conditioned on something the client sent.
  if (!(await hasPaidExport(projectId, user.id))) {
    return {
      ok: false,
      error: "This export hasn't been paid for.",
      code: "NOT_PAID",
    };
  }

  const project = await loadProject(projectId, user.id);
  if (!project) return { ok: false, error: "Project not found" };
  if (!project.block_spec || !project.design_tokens || !project.product_json) {
    return {
      ok: false,
      error:
        "This project isn't finished — build a block and run the preview, then download.",
      code: "INCOMPLETE",
    };
  }

  // The merchant's corrections win, exactly as they do in the preview. Anything
  // else would hand them code that doesn't match what they approved.
  const tokens = applyTokenOverrides(project.design_tokens, project.token_overrides ?? {});

  try {
    const generated = await runWithMeter(
      {
        userId: user.id,
        eventType: "blocks",
        meta: { projectId, phase: "export" },
      },
      () =>
        generateLiquidBlock({
          spec: project.block_spec!,
          tokens,
          product: project.product_json!,
          currency: project.product_json!.currency ?? null,
        }),
    );

    const guide = installGuide(project.block_spec.type);
    return {
      ok: true,
      liquid: generated.liquid,
      install: guide.steps,
      installText: installGuideText(project.block_spec.type),
      source: generated.source,
    };
  } catch (err) {
    console.error("[blocks] export generation failed:", (err as Error).message);
    // No refund logic, because nothing was charged HERE — the purchase already
    // happened and stays valid. They can simply try the download again.
    return {
      ok: false,
      error:
        "We couldn't build your snippet just now. Your purchase is safe — try the download again in a moment.",
      code: "GENERATION_FAILED",
    };
  }
}
