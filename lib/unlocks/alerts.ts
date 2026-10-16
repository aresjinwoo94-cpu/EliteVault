import "server-only";
import { sendEmail } from "@/lib/email/resend";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { buildUnlockAlert } from "@/lib/unlocks/alert-content";
import type { UnlockAlert } from "@/lib/unlocks/process-event";

/** Owner alerts of the one-time unlock (brief oct-2026 WP-5). Best-effort: sendEmail never throws. */
export const UNLOCK_ALERT_EMAIL = "aresjinwoo94@gmail.com";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function domainOf(analysisId: string | null): Promise<string | null> {
  if (!analysisId || analysisId === "?") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createSupabaseServiceClient() as any).from("analyses").select("url").eq("id", analysisId).maybeSingle();
    const url = (data as { url?: string } | null)?.url;
    return url ? new URL(url.startsWith("http") ? url : `https://${url}`).hostname : null;
  } catch {
    return null;
  }
}

export async function sendUnlockAlert(a: UnlockAlert): Promise<void> {
  const analysisId = a.kind === "failure" ? null : a.analysisId;
  const { subject, lines } = buildUnlockAlert(a, await domainOf(analysisId));
  await sendEmail({
    to: UNLOCK_ALERT_EMAIL,
    subject: `[EliteVault] ${subject}`,
    text: lines.join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${lines.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`,
  });
}
