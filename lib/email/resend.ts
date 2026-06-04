import "server-only";

/**
 * Minimal Resend client over the HTTP API (no SDK / dependency added).
 * Used for transactional digests. Requires:
 *   RESEND_API_KEY   — your Resend API key (re_...)
 *   RESEND_FROM      — verified sender, e.g. "EliteVault <login@elitevaultapp.com>"
 *
 * Best-effort: returns { ok:false } instead of throwing when unconfigured or
 * on a send error, so a failed email never breaks the job that called it.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from =
    opts.from ??
    process.env.RESEND_FROM ??
    "EliteVault <onboarding@resend.dev>";

  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return { ok: false, error: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[email] Resend send failed:", res.status, body.slice(0, 200));
      return { ok: false, error: `http_${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    console.warn("[email] send error:", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  }
}
