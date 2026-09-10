/**
 * Abandoned-checkout recovery email (Part 2). Pure builder — takes opts,
 * returns { subject, html, text }, no external calls. Sent by
 * inngest/functions/checkout-recovery at ~1h / ~24h / ~72h after a user opens
 * a subscription checkout without paying.
 *
 * ── THEME NOTE ──────────────────────────────────────────────────────────────
 * This template is DARK on purpose and uses the exact palette of the sign-in
 * email (supabase/email-templates/magic-link.html): near-black #06060a /
 * #0a0a0f, teal accent #2DD4BF, diamond mark + Georgia wordmark. The palette
 * lives in the constants at the top of the builder — change it there, never
 * inline, so the two emails can't drift apart again. The color scheme is
 * locked to dark (meta + :root) so Gmail/Apple Mail don't auto-invert it.
 *
 * It intentionally differs from the other transactional builders
 * (activation/receipt/etc.), which use the LIGHT theme (bg #f6f6f4, gold label
 * #b8941f, teal button #2DD4BF).
 *
 * ── CLIENT COMPATIBILITY ────────────────────────────────────────────────────
 *   • Colours are hex, not rgba, wherever Outlook would otherwise drop them
 *     (it ignores rgba). The rgba card border is the one exception: in Outlook
 *     it simply disappears.
 *   • The diamond is a text glyph in a bordered cell — no CSS transform, which
 *     Outlook and several webmails ignore.
 *   • The CTA has a VML roundrect fallback for Outlook desktop.
 *   • The card has a fixed width attribute + an MSO ghost table, because
 *     Outlook ignores max-width.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AbandonedCheckoutStep = 1 | 2 | 3;

export function buildAbandonedCheckout(opts: {
  plan: "pro" | "scale";
  price: number; // price in USD for `interval` (monthly or annual total)
  interval: "month" | "year";
  recoveryUrl: string;
  unsubscribeUrl: string;
  step: AbandonedCheckoutStep;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const { plan, price, interval, recoveryUrl, unsubscribeUrl, step } = opts;
  const planLabel = plan === "pro" ? "Pro" : "Scale";
  const priceLabel = interval === "year" ? `$${price}/yr` : `$${price}/mo`;

  // ── Brand palette — mirrors supabase/email-templates/magic-link.html ──────
  const BG_OUTER = "#06060a";
  const CARD = "#0a0a0f";
  const BORDER = "rgba(255,255,255,0.06)";
  const DIVIDER = "#19191d"; // BORDER flattened onto CARD, so Outlook still draws it
  const ACCENT = "#2DD4BF";
  const HEADING = "#ffffff";
  const BODY_TEXT = "#c9c9d1";
  const MUTED = "#8a8a94";
  const BTN_TEXT = "#0A0A0F";
  const LOGO_BG = "#0c1f1d";
  const LOGO_BORDER = "#16514d"; // teal @35% flattened onto CARD
  const PANEL_BG = "#0c1418"; // teal @5% flattened onto CARD
  const PANEL_BORDER = "#113232"; // teal @20% flattened onto CARD
  const SANS =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const SERIF = "Georgia,'Times New Roman',serif";
  const CARD_WIDTH = 520;

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

  const divider = `<div style="height:1px;background-color:${DIVIDER};line-height:1px;font-size:0;">&nbsp;</div>`;

  const featureRows = [
    "Unlimited audits on any store URL",
    "Ranked, prioritized fixes — not a punch-list",
    "+9 hand-picked winning stores in your niche",
    "7-day Meta Ads scenario modeler",
  ]
    .map(
      (f) =>
        `<tr><td width="18" style="padding:6px 0;color:${ACCENT};font-size:13px;width:18px;vertical-align:top;">&#9670;</td><td style="padding:6px 0;color:${BODY_TEXT};font-size:14px;line-height:1.5;">${f}</td></tr>`,
    )
    .join("");

  const detailsBlock = showDetails
    ? `
            <tr><td style="padding:24px 32px 0 32px;">${divider}</td></tr>
            <tr>
              <td style="padding:20px 32px 4px 32px;">
                <p style="margin:0 0 12px 0;color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:1.5px;">WHAT ${planLabel.toUpperCase()} UNLOCKS</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${featureRows}</table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 4px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PANEL_BG}" style="background-color:${PANEL_BG};border:1px solid ${PANEL_BORDER};border-radius:10px;">
                  <tr><td style="padding:14px 16px;color:${BODY_TEXT};font-size:13px;line-height:1.5;"><span style="color:${ACCENT};font-weight:700;">${priceLabel}</span> &nbsp;&middot;&nbsp; cancel anytime &nbsp;&middot;&nbsp; no card charged until you confirm</td></tr>
                </table>
              </td>
            </tr>`
    : "";

  const ctaLabel = `Complete my ${planLabel} upgrade &rarr;`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>Your ${planLabel} audit is waiting — EliteVault</title>
    <style>:root{color-scheme:dark;supported-color-schemes:dark;}</style>
    <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  </head>
  <body style="margin:0;padding:0;background-color:${BG_OUTER};color:${HEADING};font-family:${SANS};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG_OUTER};">${copy.preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG_OUTER}" style="background-color:${BG_OUTER};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <!--[if mso]><table role="presentation" align="center" width="${CARD_WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td width="${CARD_WIDTH}"><![endif]-->
          <table role="presentation" width="${CARD_WIDTH}" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="width:100%;max-width:${CARD_WIDTH}px;background-color:${CARD};border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
            <tr><td height="3" style="height:3px;background-color:${ACCENT};line-height:3px;font-size:0;">&nbsp;</td></tr>
            <tr>
              <td align="left" style="padding:28px 32px 8px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="34" height="34" align="center" valign="middle" bgcolor="${LOGO_BG}" style="width:34px;height:34px;background-color:${LOGO_BG};border:1px solid ${LOGO_BORDER};border-radius:9px;color:${ACCENT};font-family:${SANS};font-size:17px;line-height:34px;text-align:center;">&#9670;</td>
                    <td valign="middle" style="padding-left:12px;vertical-align:middle;color:${HEADING};font-family:${SERIF};font-size:20px;letter-spacing:-0.02em;">EliteVault</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 4px 32px;">
                <h1 style="margin:0;color:${HEADING};font-family:${SERIF};font-size:26px;line-height:1.2;font-weight:500;letter-spacing:-0.02em;">${copy.headline}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 8px 32px;">
                <p style="margin:0;color:${BODY_TEXT};font-size:15px;line-height:1.6;">${copy.body}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${recoveryUrl}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="20%" fillcolor="${ACCENT}" stroke="f">
                  <w:anchorlock/>
                  <center style="color:${BTN_TEXT};font-family:sans-serif;font-size:15px;font-weight:bold;">${ctaLabel}</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:10px;">
                      <a href="${recoveryUrl}" target="_blank" style="display:inline-block;padding:14px 26px;color:${BTN_TEXT};font-family:${SANS};font-size:15px;font-weight:700;text-decoration:none;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
                <!--<![endif]-->
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px 32px;">
                <p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5;">Or paste this link into your browser:</p>
                <a href="${recoveryUrl}" style="color:${ACCENT};font-size:12px;word-break:break-all;">${recoveryUrl}</a>
              </td>
            </tr>${detailsBlock}
            <tr>
              <td style="padding:24px 32px 32px 32px;">
                ${divider}
                <p style="margin:16px 0 6px 0;color:${MUTED};font-size:11px;line-height:1.5;">You're receiving this because you started a checkout at elitevaultapp.com.</p>
                <p style="margin:0;color:${MUTED};font-size:11px;line-height:1.5;">EliteVault &middot; AI ecommerce auditing for DTC operators &middot; <a href="${unsubscribeUrl}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a></p>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // Plain-text alternative — a multipart (html + text) email is materially
  // less likely to be flagged as spam than HTML-only.
  const text = [
    copy.headline,
    "",
    copy.body,
    "",
    `Complete your ${planLabel} upgrade: ${recoveryUrl}`,
    ...(showDetails
      ? [
          "",
          `What ${planLabel} unlocks:`,
          "• Unlimited audits on any store URL",
          "• Ranked, prioritized fixes — not a punch-list",
          "• +9 hand-picked winning stores in your niche",
          "• 7-day Meta Ads scenario modeler",
          "",
          `${priceLabel} · cancel anytime · no card charged until you confirm`,
        ]
      : []),
    "",
    "—",
    "You're receiving this because you started a checkout at elitevaultapp.com.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: copy.subject, html, text };
}
