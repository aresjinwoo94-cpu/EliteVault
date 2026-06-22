/**
 * Dunning / payment-failed email (Phase 4). Pure builder. Sent best-effort
 * from the Stripe webhook's invoice.payment_failed handler. Drives the user
 * to update their payment method before access is interrupted.
 */
export function buildPaymentFailed(opts: {
  planName: string;
  appUrl: string;
}): { subject: string; html: string } {
  const subject = `Action needed: your EliteVault payment didn't go through`;

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #ececec;">
        <tr><td style="padding:28px 28px 6px;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b8941f;font-weight:600;">EliteVault · billing</div>
          <h1 style="margin:8px 0 6px;font-size:22px;color:#111827;">We couldn't process your payment</h1>
          <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">Your latest payment for EliteVault ${opts.planName} failed. This usually means an expired card or insufficient funds. We'll retry automatically, but you can fix it now to avoid any interruption to your plan.</p>
        </td></tr>
        <tr><td style="padding:18px 28px 28px;">
          <a href="${opts.appUrl}/app/billing" style="display:inline-block;background:#2DD4BF;color:#0A0A0F;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px;">Update payment method</a>
          <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">You'll manage this in the Stripe Customer Portal. Need help? Email support@elitevaultapp.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
