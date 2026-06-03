"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertQuota } from "@/lib/quota/guard";
import { inngest } from "@/inngest/client";
import { normalizeUrl } from "@/lib/utils";

export type MonitorActionResult = { ok: true } | { ok: false; error: string };

const AddInput = z.object({
  url: z.string().min(3),
  kind: z.enum(["self", "competitor"]),
});

/**
 * Add a store to monitor. `self` replaces any existing self store (only one);
 * `competitor` is gated by the per-plan quota (assertQuota). Inserts run as
 * the user (RLS enforces ownership).
 */
export async function addMonitoredStore(
  _prev: MonitorActionResult | null,
  formData: FormData,
): Promise<MonitorActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = AddInput.safeParse({
    url: formData.get("url"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) return { ok: false, error: "Enter a valid URL." };

  const url = normalizeUrl(parsed.data.url);
  let domain: string;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }
  const kind = parsed.data.kind;

  if (kind === "competitor") {
    const quota = await assertQuota(user.id, "monitoredCompetitor");
    if (!quota.ok) return { ok: false, error: quota.reason };
  } else {
    // Only one self store — replace any existing one.
    await supabase
      .from("monitored_stores")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", "self");
  }

  const { error } = await supabase.from("monitored_stores").insert({
    user_id: user.id,
    url,
    domain,
    kind,
    label: domain,
    is_active: true,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "You're already monitoring that store." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/monitor");
  return { ok: true };
}

export async function removeMonitoredStore(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase
    .from("monitored_stores")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/app/monitor");
}

/** Trigger an immediate re-audit of the current user's own stores. */
export async function runMyCheckNow(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await inngest.send({
    name: "monitoring/reaudit.requested",
    data: { userId: user.id },
  });
  revalidatePath("/app/monitor");
}
