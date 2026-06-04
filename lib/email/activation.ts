/**
 * Activation follow-up email (Phase 5). Pure builder. Sent a few days after a
 * user's first successful audit to pull them back for the second — the moment
 * that turns a trial into a habit. Measures whether their score moved.
 */

export function buildActivation(opts: {
  firstScore: number;
  latestScore: number | null;
  appUrl: string;
}): { subject: string; html: string } {
  const { firstScore, appUrl } = opts;
  const latest = opts.latestScore ?? firstScore;
  const improved = latest > firstScore;
  const delta = latest - firstScore;

  const subject = improved
    ? `Your conversion score climbed to ${latest} 🎉`
    : `Your store scored ${firstScore} — here's how to move it`;

  const headline = improved
    ? `Nice — your score went up ${delta} point${delta === 1 ? "" : "s"}.`
    : `You scored ${firstScore}/100 on your first audit.`;

  const body = improved
    ? `From <strong>${firstScore}</strong> to <strong>${latest}</strong>. Keep the momentum — run another audit to find the next lever and push it higher.`
    : `Every audit hands you a prioritized fix. Apply your #1 fix, then re-run the audit to watch the number climb — most stores see the biggest jump on the homepage.`;

  const cta = improved ? "Run another audit →" : "Apply a fix & re-audit →";

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #ececec;">
        <tr><td style="padding:28px 28px 6px;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b8941f;font-weight:600;">EliteVault</div>
          <h1 style="margin:8px 0 6px;font-size:22px;color:#111827;">${headline}</h1>
          <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">${body}</p>
        </td></tr>
        <tr><td style="padding:18px 28px 28px;">
          <a href="${appUrl}/app/analyzer" style="display:inline-block;background:#D4AF37;color:#0A0A0F;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px;">${cta}</a>
          <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">You're getting this because you ran an audit on EliteVault. We send this once.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
