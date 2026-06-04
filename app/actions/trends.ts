"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

function internalEmails(): string[] {
  return (process.env.INTERNAL_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * INTERNAL-ONLY: kick the weekly Trends refresh on demand (for seeding /
 * testing without waiting for the Monday cron). Gated to INTERNAL_EMAILS;
 * anyone else is a no-op. The heavy work runs in the Inngest job — this just
 * emits the trigger event.
 */
export async function refreshTrendsNow(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = (user?.email ?? "").toLowerCase();
  const allow = internalEmails();
  if (!user || allow.length === 0 || !allow.includes(email)) return;

  const nicheSlug = String(formData.get("niche") ?? "").trim() || null;
  await inngest.send({
    name: "trends/refresh.requested",
    data: { nicheSlug, force: false },
  });

  revalidatePath("/app/trends");
}
