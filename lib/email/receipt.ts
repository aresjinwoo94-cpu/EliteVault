/**
 * Payment receipt email (Phase 4). Pure builder. Sent best-effort from the
 * Stripe webhook's invoice.payment_succeeded handler.
 */
export function buildReceipt(opts: {
  planName: string;
  amount: string; // pre-formatted, e.g. "$19.00"
  interval?: "month" | "year" | null;
  date: string;
  invoiceUrl?: string | null;
  appUrl: string;
}): { subject: string; html: string } {
  const period =
    opts.interval === "year"
      ? "annual"
      : opts.interval === "month"
        ? "monthly"
        : "";
  const subject = `Your EliteVault receipt — ${opts.amount}`;

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #ececec;">
        <tr><td style="padding:28px 28px 6px;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b8941f;font-weight:600;">EliteVault · receipt</div>
          <h1 style="margin:8px 0 4px;font-size:22px;color:#111827;">Thanks for your payment</h1>
          <p style="margin:0;color:#6b7280;font-size:13px;">${opts.date}</p>
        </td></tr>
        <tr><td style="padding:14px 28px 4px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#111827;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #ececec;">EliteVault ${opts.planName}${period ? ` (${period})` : ""}</td>
              <td align="right" style="padding:10px 0;border-bottom:1px solid #ececec;font-weight:700;">${opts.amount}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#6b7280;">Total paid</td>
              <td align="right" style="padding:10px 0;font-weight:700;">${opts.amount}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:18px 28px 28px;">
          ${
            opts.invoiceUrl
              ? `<a href="${opts.invoiceUrl}" style="display:inline-block;background:#2DD4BF;color:#0A0A0F;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px;">View invoice</a>`
              : `<a href="${opts.appUrl}/app/billing" style="display:inline-block;background:#2DD4BF;color:#0A0A0F;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px;">Manage billing</a>`
          }
          <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">Manage or cancel anytime from your billing settings. Questions? Reply to support@elitevaultapp.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
