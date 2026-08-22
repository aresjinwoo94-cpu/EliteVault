"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateBlocksUrl } from "@/lib/blocks/entry-gate";
import { fetchShopifyProduct } from "@/lib/blocks/fetch-product";

/**
 * Liquid Blocks — server actions.
 *
 * WP-A covers the entry point only: validate, fetch the product's real data,
 * and create the project row. Nothing here costs a credit. The charge happens
 * once, at export (WP-D), because that's where the value is — the preview is
 * the hook and has to be free to be one.
 *
 * The gate order matters and is enforced in lib/blocks/entry-gate.ts: SSRF →
 * page-kind → Shopify shape, all pure string checks, so a homepage URL is
 * refused before we've touched the network.
 */

const CreateProjectInput = z.object({
  url: z.string().min(3),
});

export type CreateBlocksProjectResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      /**
       * Machine-readable reason. The UI reacts differently to a URL the user
       * can fix (NOT_PRODUCT) than to a platform limit that they can't
       * (NOT_SHOPIFY) — telling someone to "check the URL" when the URL was
       * fine is worse than saying nothing.
       */
      code?: string;
    };

export async function createBlocksProject(
  input: z.infer<typeof CreateProjectInput>,
): Promise<CreateBlocksProjectResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = CreateProjectInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Paste your product page URL.", code: "INVALID_URL" };
  }

  const gate = evaluateBlocksUrl(parsed.data.url);
  if (!gate.ok) return { ok: false, error: gate.error, code: gate.code };

  // The store's own answer to "what is this product". Fetched BEFORE the row is
  // created so an unreachable or non-Shopify store never leaves a dead project
  // behind for the user to wonder about.
  const fetched = await fetchShopifyProduct(gate.ref.productJsUrl);
  if (!fetched.ok) return { ok: false, error: fetched.error, code: fetched.code };

  // `as any`: lib/supabase/types.ts stops at migration 0001, so every table
  // added since resolves to `never` and rejects its own insert shape. Same
  // escape hatch the other post-0001 features use (see app/actions/reviews.ts);
  // it goes away when the Database type is regenerated (docs/infra-debt.md).
  const { data: row, error } = await (supabase.from("blocks_projects") as any)
    .insert({
      user_id: user.id,
      product_url: gate.url,
      product_handle: gate.ref.handle,
      product_json: { ...fetched.product, currency: fetched.currency },
      status: "queued",
    })
    .select("id")
    .single();

  if (error || !row) {
    // Postgres' own words are for the log, not for a toast. The one case worth
    // naming out loud is a deploy that landed ahead of migration 0032: without
    // it, every submission fails at the insert and "relation does not exist"
    // tells the user nothing they can act on.
    console.error("[blocks] project insert failed:", error);
    const missingTable =
      error?.code === "42P01" || /blocks_projects/i.test(error?.message ?? "");
    return {
      ok: false,
      code: missingTable ? "NOT_PROVISIONED" : "INSERT_FAILED",
      error: missingTable
        ? "Liquid Blocks isn't switched on for this workspace yet. It needs one database migration that hasn't run here — nothing you did wrong."
        : "We couldn't start that project. Try again in a moment.",
    };
  }

  revalidatePath("/app/liquid");
  return { ok: true, id: row.id as string };
}
