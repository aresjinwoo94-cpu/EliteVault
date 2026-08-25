"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateBlockSpec, type BlockSpecInput } from "@/lib/blocks/catalog";
import {
  applyTokenOverrides,
  OVERRIDABLE_TOKENS,
  type DesignTokens,
} from "@/lib/blocks/design-tokens";

/**
 * Liquid Blocks WP-C — choosing a block and correcting what we measured.
 *
 * Its own module, beside blocks.ts (entry) and blocks-preview.ts (dispatch),
 * for the same reason they're separate: a static test asserts the ENTRY module
 * has no credit machinery, and that assertion only stays meaningful while each
 * path lives somewhere of its own. Nothing here charges anything either — the
 * money moment is the export, in WP-D.
 *
 * Both actions re-validate on the server. The client forms do their own
 * checking so the merchant gets immediate feedback, but that's a convenience:
 * the claims end up on a public storefront and the tokens end up inside a
 * `<style>` block, so neither can be taken on the browser's word.
 */

export type ComposeResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string; missing?: string[] };

async function ownedProject(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("blocks_projects")
    .select("id, design_tokens, token_overrides")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!data) return null;
  return { supabase, userId: user.id, row: data as unknown as Record<string, unknown> };
}

/**
 * Save the block the merchant chose, with the claims they supplied.
 *
 * An incomplete spec is REFUSED and the missing fields are named — the whole
 * point of the catalogue's validator. Nothing is filled in on their behalf,
 * because every claim here ends up on a product page as a promise they'll be
 * held to.
 */
export async function saveBlockSpec(
  projectId: string,
  spec: BlockSpecInput,
): Promise<ComposeResult> {
  try {
    return await doSaveBlockSpec(projectId, spec);
  } catch (err) {
    // Same rule as every action in this feature: an unexpected throw becomes a
    // returned error, never the page-level error boundary. See
    // app/actions/blocks-preview.ts for what that failure looked like.
    console.error("[blocks] saveBlockSpec threw:", err);
    return { ok: false, error: "We could not save that. Try again in a moment." };
  }
}

async function doSaveBlockSpec(
  projectId: string,
  spec: BlockSpecInput,
): Promise<ComposeResult> {
  const ctx = await ownedProject(projectId);
  if (!ctx) return { ok: false, error: "Project not found" };

  const validated = validateBlockSpec(spec);
  if (!validated.ok) {
    return {
      ok: false,
      error: "We still need a few details before we can build this block.",
      missing: validated.missing,
    };
  }

  // `as any`: post-0001 tables resolve to `never` under the stale Database
  // type. See app/actions/blocks.ts.
  const { error } = await (ctx.supabase.from("blocks_projects") as any)
    .update({ block_spec: validated.spec, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", ctx.userId);
  if (error) {
    console.error("[blocks] saveBlockSpec failed:", error);
    return { ok: false, error: "We couldn't save that. Try again in a moment." };
  }

  revalidatePath(`/app/liquid/${projectId}`);
  return { ok: true, warnings: validated.warnings };
}

/**
 * Save the merchant's corrections to the measured tokens.
 *
 * Stored as the raw override map rather than merged into `design_tokens`:
 * keeping the measurement and the correction apart is what lets the UI keep
 * saying which is which, and lets a re-measure refresh what we read without
 * throwing away what they told us.
 *
 * A value that doesn't survive `applyTokenOverrides` is dropped there — it
 * refuses rather than sanitizes, because a half-understood colour would give
 * them one nobody chose.
 */
export async function saveTokenOverrides(
  projectId: string,
  overrides: Record<string, string>,
): Promise<ComposeResult> {
  try {
    return await doSaveTokenOverrides(projectId, overrides);
  } catch (err) {
    console.error("[blocks] saveTokenOverrides threw:", err);
    return { ok: false, error: "We could not save those. Try again in a moment." };
  }
}

async function doSaveTokenOverrides(
  projectId: string,
  overrides: Record<string, string>,
): Promise<ComposeResult> {
  const ctx = await ownedProject(projectId);
  if (!ctx) return { ok: false, error: "Project not found" };

  const measured = ctx.row.design_tokens as DesignTokens | null;
  if (!measured) {
    return {
      ok: false,
      error: "We haven't measured this page yet — run the preview first.",
    };
  }

  // Keep only the keys the schema knows about, so the stored object can't
  // accumulate junk that a later reader has to defend against.
  const clean: Record<string, string> = {};
  for (const key of OVERRIDABLE_TOKENS) {
    const value = Object.prototype.hasOwnProperty.call(overrides, key)
      ? overrides[key]
      : undefined;
    if (typeof value === "string" && value.trim()) clean[key] = value.trim();
  }

  // Run it now so a value that would be refused never reaches the database,
  // and so the merchant is told immediately rather than at export time.
  const applied = applyTokenOverrides(measured, clean);
  const refused = Object.keys(clean).filter((k) => !applied.userCorrected.includes(k));

  const { error } = await (ctx.supabase.from("blocks_projects") as any)
    .update({ token_overrides: clean, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", ctx.userId);
  if (error) {
    console.error("[blocks] saveTokenOverrides failed:", error);
    return { ok: false, error: "We couldn't save those. Try again in a moment." };
  }

  revalidatePath(`/app/liquid/${projectId}`);
  return {
    ok: true,
    warnings: [
      ...applied.warnings,
      ...(refused.length
        ? [
            `We couldn't read ${refused.length} of those values, so we kept what we measured for them.`,
          ]
        : []),
    ],
  };
}
