/**
 * Cancellation-confirmation email (Phase 4). Pure builder. Sent best-effort
 * from the Stripe webhook's customer.subscription.deleted handler.
 */
export function buildCancellation(opts: {
  planName: string;
  accessUntil: string | null; // formatted end-of-access date
  appUrl: string;
}): { subject: string; html: string } {
  const subject = `Your EliteVault subscription is cancelled`;

  const access = opts.accessUntil
    ? `You'll keep your ${opts.planName} features until <strong>${opts.accessUntil}</strong>, then your account moves to the Free plan.`
    : `Your plan will move to Free at the end of the current billing period.`;

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #ececec;">
        <tr><td style="padding:28px 28px 6px;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b8941f;font-weight:600;">EliteVault · billing</div>
          <h1 style="margin:8px 0 6px;font-size:22px;color:#111827;">Subscription cancelled</h1>
          <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">${access} No further charges will be made.</p>
        </td></tr>
        <tr><td style="padding:18px 28px 28px;">
          <a href="${opts.appUrl}/app/billing" style="display:inline-block;background:#2DD4BF;color:#0A0A0F;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px;">Reactivate anytime</a>
          <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">Changed your mind or cancelled by mistake? Resubscribe anytime, or email support@elitevaultapp.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
