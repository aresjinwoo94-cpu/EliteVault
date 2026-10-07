"use server";

import { getOwner } from "@/lib/admin/guard";
import { runOwnerReset } from "@/lib/admin/reset";
import type { ResetResult } from "@/lib/admin/reset-core";

/**
 * "Reiniciar a 0" — owner only (fail-closed via getOwner()). Moves the metrics
 * reset point to now(); with `purgeTraffic` it also deletes older
 * page_views/sessions. Never touches Stripe or users.
 */
export async function resetOwnerMetrics(input: {
  purgeTraffic?: boolean;
}): Promise<{ ok: true; result: ResetResult } | { ok: false; error: string }> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  try {
    const result = await runOwnerReset({ purgeTraffic: !!input?.purgeTraffic });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
