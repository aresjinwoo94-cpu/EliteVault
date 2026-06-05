"use server";

import { z } from "zod";
import { sendEmail } from "@/lib/email/resend";
import { COMPANY } from "@/lib/company";

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

/**
 * Public contact form handler. Validates with zod, then emails the support
 * inbox via the existing best-effort sendEmail() (no-ops without
 * RESEND_API_KEY, never throws). The sender's address is included in the body
 * so support can reply manually (the minimal sendEmail has no reply-to).
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
  const subject = `Support${topic ? ` · ${topic}` : ""} — ${name}`;
  const html = `
    <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
    ${topic ? `<p><strong>Topic:</strong> ${escapeHtml(topic)}</p>` : ""}
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
  `;

  const sent = await sendEmail({ to: COMPANY.contactEmail, subject, html });
  if (!sent.ok) {
    // Don't lose the report silently — surface in server logs for follow-up.
    console.warn("[support] email not sent:", sent.error, { from: email, subject });
  }

  // Confirm to the user regardless (best-effort delivery).
  return { ok: true };
}
