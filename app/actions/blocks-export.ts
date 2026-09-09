"use server";

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { resolveStripeCustomerId } from "@/lib/stripe/customer";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/utils";
import {
  EXPORT_NOT_CONFIGURED,
  exportPriceId,
  getExportPrice,
  isExportConfigured,
  type ExportPrice,
} from "@/lib/blocks/export-pricing";
import { generateLiquidBlock } from "@/ai/agents/liquid-block-agent";
import { installGuide, installGuideText } from "@/lib/blocks/install-instructions";
import { settleExport } from "@/lib/blocks/settle-export";

import { runWithMeter } from "@/lib/usage/context";
import { validateBlockSpec, type BlockSpecInput } from "@/lib/blocks/catalog";
import { applyTokenOverrides, type DesignTokens } from "@/lib/blocks/design-tokens";
import type { BlocksProduct } from "@/lib/blocks/product-json";
import type { PlanTier } from "@/lib/supabase/types";

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
  /**
   * True when we could not determine the state at all — a failed read, not a
   * missing price.
   *
   * Without this, a transient Supabase or Stripe failure degraded to
   * {paid:false, configured:false}, which told someone who HAD paid that
   * "downloads aren't switched on yet". That is a confident, false statement
   * about our own configuration during what is actually an outage — the same
   * class of true-sounding-but-wrong the rest of this feature refuses to make.
   */
  unknown?: boolean;
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
  try {
    return await readExportStatus(projectId);
  } catch (err) {
    /**
     * This one is called during the project page's own RENDER, so a throw here
     * doesn't produce a failed action — it produces the error boundary, and the
     * merchant loses the whole page including a preview that was working.
     *
     * Degrading to "not configured" is the safe direction: the export panel
     * shows its locked state, everything above it still renders, and nobody is
     * offered a purchase we couldn't currently complete.
     */
    console.error("[blocks] export status unavailable:", err);
    return { paid: false, configured: false, price: null, unknown: true };
  }
}

async function readExportStatus(projectId: string): Promise<ExportStatus> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { paid: false, configured: false, price: null };

  const [paid, price] = await Promise.all([
    hasPaidExport(projectId, user.id),
    getExportPrice(),
  ]);
  // "Configured" is about OUR setup, not about Stripe being reachable. Deriving
  // it from a failed price fetch told merchants the price "hasn't been set up"
  // during a transient Stripe outage, when it had been — a true-sounding
  // statement about the wrong thing.
  return { paid, configured: isExportConfigured(), price };
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
  try {
    return await doStartExportCheckout(projectId);
  } catch (err) {
    console.error("[blocks] startExportCheckout threw:", err);
    return { ok: false, error: "We could not open the payment form. Try again." };
  }
}

async function doStartExportCheckout(
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
    /**
     * Attach the purchase to the buyer's Stripe Customer where one exists.
     *
     * In `mode: "payment"` Stripe's `customer_creation` defaults to
     * `if_required`, so without this a Pro subscriber's export shows up as an
     * unattached guest payment: it doesn't appear under their customer record,
     * their LTV fragments across two identities, and finding the payment later
     * means searching PaymentIntents by email instead of opening the customer.
     * Refunds and receipts work either way, so this is a finance-hygiene fix —
     * and a far more annoying one to apply after real payments exist.
     *
     * Best-effort: `resolveStripeCustomerId` returns null for someone who has
     * never subscribed, and the session falls back to `customer_email`.
     */
    let customerId: string | null = null;
    try {
      const service = createSupabaseServiceClient();
      const { data: profile } = await service
        .from("profiles")
        .select("stripe_customer_id, email")
        .eq("id", user.id)
        .single();
      customerId = await resolveStripeCustomerId({
        userId: user.id,
        email: (profile as { email?: string } | null)?.email ?? user.email ?? null,
        storedId: (profile as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null,
      });
    } catch (err) {
      console.warn("[blocks] customer lookup skipped:", (err as Error).message);
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(customerId
        ? { customer: customerId }
        : { customer_email: user.email ?? undefined }),
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
      // Kept in lockstep with app/api/stripe/checkout/route.ts — "amazon_pay"
      // is back now that Amazon Pay is activated and elitevaultapp.com is
      // registered under Stripe's Payment method domains.
      payment_method_types: ["card", "amazon_pay", "cashapp", "link"],
      locale: "auto",
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
  try {
    return await doConfirmExportPayment(projectId, sessionId);
  } catch (err) {
    // Runs during the project page render, from the URL Stripe redirects to.
    // A throw here would replace a just-completed purchase with a broken page.
    // The webhook settles the same payment independently, so failing quietly
    // here loses nothing but this one attempt.
    console.error("[blocks] eager confirm threw:", err);
    return { ok: false, paid: false };
  }
}

async function doConfirmExportPayment(
  projectId: string,
  sessionId: string,
): Promise<{ ok: boolean; paid: boolean }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, paid: false };

  /**
   * Only ask Stripe about a session WE opened.
   *
   * This runs on a GET render from a URL the user controls, so without it a
   * signed-in user could loop the page with arbitrary ids and turn it into an
   * unmetered amplifier against our Stripe read budget. The pending row written
   * by `startExportCheckout` is the proof that this session is ours — and if
   * that row is missing, the session cannot be one we created for them anyway.
   */
  const supabaseCheck = await createSupabaseServerClient();
  const { data: known } = await supabaseCheck
    .from("blocks_exports")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .eq("user_id", user.id)
    .limit(1);
  if (!Array.isArray(known) || known.length === 0) {
    return { ok: false, paid: false };
  }

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
 * Hand over the code. The one function in the feature that returns Liquid.
 */
export async function exportLiquid(projectId: string): Promise<ExportLiquidResult> {
  try {
    return await doExportLiquid(projectId);
  } catch (err) {
    // The generation path already handles its own failures; this is the outer
    // net. Their purchase stands either way — nothing here charges anything.
    console.error("[blocks] exportLiquid threw:", err);
    return {
      ok: false,
      error:
        "We could not build your snippet just now. Your purchase is safe — try the download again in a moment.",
      code: "GENERATION_FAILED",
    };
  }
}

async function doExportLiquid(projectId: string): Promise<ExportLiquidResult> {
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

  /**
   * WP-E — the plan at the time of the call.
   *
   * A snapshot, not a gate: the export is available on every plan, and this
   * only exists so `usage_events` can answer "what does a Blocks export cost us
   * per tier". Without it every export row landed with plan null and that
   * question had no answer at all. Best-effort, because a metering detail must
   * never fail a purchase the customer already paid for.
   */
  let plan: PlanTier | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    plan = (profile as { plan?: PlanTier } | null)?.plan ?? null;
  } catch {
    /* metering detail — never worth failing the export over */
  }

  /**
   * Re-validate the stored spec before rendering it.
   *
   * `validateBlockSpec` ran only in `saveBlockSpec`, so this path rendered
   * whatever was in the row on trust. A spec that arrived by any other route —
   * a row written before a validator rule existed, a direct database write —
   * reached `renderBlock` unchecked, and `renderBlock` does not defend itself:
   * a malformed member throws a TypeError mid-render, which on the export path
   * is a customer who has already paid.
   *
   * Refusing here is the right failure: it names what is wrong and leaves the
   * paid row intact, so the merchant can fix the block and export again.
   */
  const revalidated = validateBlockSpec(project.block_spec!);
  if (!revalidated.ok) {
    return {
      ok: false as const,
      error:
        "This block needs a fix before it can be exported: " +
        revalidated.missing.join("; "),
    };
  }

  try {
    const generated = await runWithMeter(
      {
        userId: user.id,
        plan,
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
