"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

/**
 * Liquid Blocks WP-B — dispatch a preview run.
 *
 * Deliberately its own module, not part of app/actions/blocks.ts. That file is
 * the ENTRY path and a static test asserts it contains no Inngest and no credit
 * machinery, so that "creating a project spends nothing and queues nothing"
 * stays a checkable statement rather than a habit. Keeping dispatch here means
 * the assertion survives WP-D adding a paid export beside it.
 *
 * Still free: no credit is read, deducted or refunded anywhere in this path.
 * The preview is the hook; the charge is at export.
 */

export type RequestPreviewResult =
  | { ok: true }
  | { ok: false; error: string };

export async function requestBlocksPreview(
  projectId: string,
): Promise<RequestPreviewResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Ownership is enforced by RLS, but reading the row first also tells us
  // whether a run is already in flight — dispatching a second browser session
  // for the same project would burn the concurrency slot the first one needs.
  const { data: project } = await supabase
    .from("blocks_projects")
    .select("id, status")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return { ok: false, error: "Project not found" };

  const row = project as unknown as { status: string };
  if (row.status === "capturing") return { ok: true };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  // `as any`: lib/supabase/types.ts stops at migration 0001, so every table
  // added since resolves to `never` and rejects its own update shape. Same
  // escape hatch the other post-0001 features use — see app/actions/blocks.ts.
  await (supabase.from("blocks_projects") as any)
    .update({ status: "queued", error: null, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", user.id);

  await inngest.send({
    name: "blocks/preview.requested",
    data: {
      projectId,
      userId: user.id,
      // Plan is carried for COGS attribution only (WP-E). It gates nothing —
      // every plan gets the free preview.
      plan: (profile as unknown as { plan?: string } | null)?.plan ?? null,
    },
  });

  return { ok: true };
}
