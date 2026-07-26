/**
 * Abandoned-checkout recovery email (Part 2). Pure builder — takes opts,
 * returns { subject, html }, no external calls. Sent by
 * inngest/functions/checkout-recovery at ~1h / ~24h / ~72h after a user opens
 * a subscription checkout without paying.
 *
 * ── THEME NOTE ──────────────────────────────────────────────────────────────
 * This template is DARK on purpose — it mirrors the sign-in email (green-black
 * background, teal accent, diamond wordmark), which is what Ariel asked to
 * imitate. It will therefore look different from the other transactional
 * builders (activation/receipt/etc.), which use the LIGHT theme (bg #f6f6f4,
 * gold label #b8941f, teal button #2DD4BF).
 *
 * To switch this email to the LIGHT theme so it matches the rest of the
 * transactional system instead, swap the palette below:
 *   BG_OUTER  #070D0B → #f6f6f4     CARD      #0B1512 → #ffffff
 *   BORDER    #16211D → #ececec     HEADING   #FFFFFF → #111827
 *   BODY_TEXT #9FB3AC → #4b5563     MUTED     #5C726B → #9ca3af
 *   ACCENT    #5AE7D0 → #2DD4BF     BTN_TEXT  #04120D → #0A0A0F
 * and drop the dark meta color-scheme. Nothing else needs to change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AbandonedCheckoutStep = 1 | 2 | 3;

export function buildAbandonedCheckout(opts: {
  plan: "pro" | "scale";
  price: number; // monthly price in USD
  recoveryUrl: string;
  unsubscribeUrl: string;
  step: AbandonedCheckoutStep;
  appUrl: string;
}): { subject: string; html: string } {
  const { plan, price, recoveryUrl, unsubscribeUrl, step } = opts;
  const planLabel = plan === "pro" ? "Pro" : "Scale";

  // Copy escalates gently across the three sends without fake discounts or
  // false urgency (honest by design — see the brief).
  const copy = {
    1: {
      subject: `You're one step from your ${planLabel} audit — EliteVault`,
      preheader: `Your ${planLabel} checkout didn't finish. Pick up where you left off — no charge was made.`,
      headline: `You were one step from your ${planLabel} audit.`,
      body: `Your checkout didn't finish, so your account is still on Free. Pick up where you left off — under a minute, and no charge was made.`,
    },
    2: {
      subject: `What EliteVault ${planLabel} unlocks for your store`,
      preheader: `Unlimited audits, ranked fixes, +9 winners in your niche and the Meta Ads modeler.`,
      headline: `Here's exactly what ${planLabel} unlocks.`,
      body: `You started your ${planLabel} upgrade yesterday but didn't finish. Here's what's waiting the moment you do — no charge was made when you left.`,
    },
    3: {
      subject: `Last nudge on your EliteVault ${planLabel} upgrade`,
      preheader: `Your ${planLabel} checkout is still open. One click to finish.`,
      headline: `Still want your ${planLabel} audit?`,
      body: `This is the last reminder we'll send about your ${planLabel} upgrade. Your checkout is still one click away — no charge was made.`,
    },
  }[step];

  // step 3 is intentionally short: headline + body + button + unsubscribe.
  const showDetails = step !== 3;

  const featureRows = [
    "Unlimited audits on any store URL",
    "Ranked, prioritized fixes — not a punch-list",
    "+9 hand-picked winning stores in your niche",
    "7-day Meta Ads scenario modeler",
  ]
    .map(
      (f) =>
        `<tr><td style="padding:6px 0;color:#5AE7D0;font-size:13px;width:18px;vertical-align:top;">&#9670;</td><td style="padding:6px 0;color:#C9D9D3;font-size:14px;line-height:1.5;">${f}</td></tr>`,
    )
    .join("");

  const detailsBlock = showDetails
    ? `
            <tr><td style="padding:24px 32px 0 32px;"><div style="height:1px;background-color:#16211D;"></div></td></tr>
            <tr>
              <td style="padding:20px 32px 4px 32px;">
                <p style="margin:0 0 12px 0;color:#5AE7D0;font-size:11px;font-weight:700;letter-spacing:1.5px;">WHAT ${planLabel.toUpperCase()} UNLOCKS</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${featureRows}</table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 4px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0E1B16;border:1px solid #16332A;border-radius:10px;">
                  <tr><td style="padding:14px 16px;color:#9FB3AC;font-size:13px;line-height:1.5;"><span style="color:#5AE7D0;font-weight:700;">$${price}/mo</span> &nbsp;&middot;&nbsp; cancel anytime &nbsp;&middot;&nbsp; no card charged until you confirm</td></tr>
                </table>
              </td>
            </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>Your ${planLabel} audit is waiting — EliteVault</title>
  </head>
  <body style="margin:0;padding:0;background-color:#070D0B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${copy.preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#070D0B;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#0B1512;border:1px solid #16211D;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <span style="display:inline-block;vertical-align:middle;width:22px;height:22px;background-color:#5AE7D0;border-radius:5px;transform:rotate(45deg);"></span>
                <span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#EAF6F1;font-size:18px;font-weight:700;letter-spacing:-0.2px;">EliteVault</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 4px 32px;">
                <h1 style="margin:0;color:#FFFFFF;font-size:26px;line-height:1.25;font-weight:800;">${copy.headline}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 8px 32px;">
                <p style="margin:0;color:#9FB3AC;font-size:15px;line-height:1.6;">${copy.body}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" bgcolor="#5AE7D0" style="border-radius:10px;">
                      <a href="${recoveryUrl}" style="display:inline-block;padding:14px 26px;color:#04120D;font-size:15px;font-weight:700;text-decoration:none;">Complete my ${planLabel} upgrade &rarr;</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px 32px;">
                <p style="margin:0;color:#5C726B;font-size:12px;line-height:1.5;">Or paste this link into your browser:</p>
                <a href="${recoveryUrl}" style="color:#5AE7D0;font-size:12px;word-break:break-all;">${recoveryUrl}</a>
              </td>
            </tr>${detailsBlock}
            <tr>
              <td style="padding:24px 32px 32px 32px;">
                <div style="height:1px;background-color:#16211D;margin-bottom:16px;"></div>
                <p style="margin:0 0 6px 0;color:#5C726B;font-size:11px;line-height:1.5;">You're receiving this because you started a checkout at elitevaultapp.com.</p>
                <p style="margin:0;color:#5C726B;font-size:11px;line-height:1.5;">EliteVault &middot; AI ecommerce auditing for DTC operators &middot; <a href="${unsubscribeUrl}" style="color:#5C726B;text-decoration:underline;">Unsubscribe</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject, html };
}
