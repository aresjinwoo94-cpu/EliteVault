"use server";

import { z } from "zod";
import { sendEmail } from "@/lib/email/resend";
import { COMPANY } from "@/lib/company";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type SupportResult = { ok: true } | { ok: false; error: string };

const ContactInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  topic: z.string().trim().max(60).optional(),
  message: z.string().trim().min(10).max(4000),
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shown when we could neither store nor email the message. */
const HARD_FAIL = `We couldn't submit your message right now. Please email us at ${COMPANY.contactEmail} or reach us on Instagram (@elite_vault_team).`;

/**
 * Public contact form handler.
 *
 * Durability first (brief §3.3): the message is STORED before we try to email
 * it, so a Resend outage or a missing key never loses it — the row stays with
 * email_sent=false for follow-up. We then notify the owner (SUPPORT_NOTIFY_EMAIL)
 * and the support inbox (COMPANY.contactEmail), with the sender's address as
 * reply-to so a reply is one click. Success is reported when EITHER the store or
 * the email worked; only a total failure returns ok:false with an honest
 * message pointing at email + Instagram.
 */
export async function submitSupportRequest(
  _prev: SupportResult | null,
  formData: FormData,
): Promise<SupportResult> {
  const parsed = ContactInput.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    topic: formData.get("topic") || undefined,
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please enter your name, a valid email, and a message (10+ characters).",
    };
  }

  const { name, email, topic, message } = parsed.data;

  // 1) Store first so nothing is lost if the email fails.
  let rowId: string | null = null;
  let stored = false;
  try {
    const service = createSupabaseServiceClient();
    // support_messages isn't in the generated Database type yet, so .insert()
    // types as never — cast, same workaround as app/actions/reviews.ts.
    const { data, error } = await (service.from("support_messages") as any)
      .insert({ name, email, topic: topic ?? null, message, email_sent: false })
      .select("id")
      .single();
    if (error) throw error;
    rowId = (data as { id: string } | null)?.id ?? null;
    stored = true;
  } catch (err) {
    console.warn("[support] could not store message:", (err as Error).message);
  }

  // 2) Notify the owner + the support inbox. SUPPORT_NOTIFY_EMAIL is server-only
  //    and optional — without it we email only the support inbox, as before.
  const recipients = [process.env.SUPPORT_NOTIFY_EMAIL, COMPANY.contactEmail]
    .map((r) => r?.trim())
    .filter((r): r is string => !!r);
  const to = [...new Set(recipients)];

  const subject = `Support${topic ? ` · ${topic}` : ""} — ${name}`;
  const html = `
    <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
    ${topic ? `<p><strong>Topic:</strong> ${escapeHtml(topic)}</p>` : ""}
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
  `;

  const sent = await sendEmail({ to, subject, html, replyTo: email });
  if (!sent.ok) {
    console.warn("[support] email not sent:", sent.error, { from: email, subject });
  }

  // 3) Record the delivery outcome on the stored row (best-effort).
  if (sent.ok && stored && rowId) {
    try {
      const service = createSupabaseServiceClient();
      await (service.from("support_messages") as any)
        .update({ email_sent: true })
        .eq("id", rowId);
    } catch (err) {
      console.warn("[support] could not mark email_sent:", (err as Error).message);
    }
  }

  // 4) Only a total failure (neither stored nor emailed) is a real loss.
  if (!stored && !sent.ok) {
    return { ok: false, error: HARD_FAIL };
  }
  return { ok: true };
}
