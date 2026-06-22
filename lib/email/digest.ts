/**
 * Weekly monitoring digest email builder. Pure function (no I/O) so it's easy
 * to reason about and test. Light theme — renders reliably across mail clients.
 */

export type DigestStore = {
  label: string;
  url: string;
  kind: "self" | "competitor";
  score: number | null;
  prevScore: number | null;
  delta: number | null; // score - prevScore (null on first run)
};

function deltaBadge(delta: number | null): string {
  if (delta === null || delta === 0) {
    return `<span style="color:#6b7280;font-size:13px;">no change</span>`;
  }
  const up = delta > 0;
  const color = up ? "#16a34a" : "#dc2626";
  const arrow = up ? "▲" : "▼";
  return `<span style="color:${color};font-weight:600;font-size:13px;">${arrow} ${Math.abs(delta)}</span>`;
}

function row(s: DigestStore): string {
  const score = s.score ?? "—";
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #ececec;">
        <div style="font-weight:600;color:#111827;font-size:14px;">${escapeHtml(s.label)}</div>
        <div style="color:#9ca3af;font-size:12px;">${escapeHtml(s.url)}${s.kind === "self" ? " · your store" : ""}</div>
      </td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #ececec;white-space:nowrap;">
        <span style="font-size:20px;font-weight:700;color:#111827;">${score}</span>
        <span style="color:#9ca3af;font-size:12px;">/100</span>
        <div>${deltaBadge(s.delta)}</div>
      </td>
    </tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDigest(opts: {
  stores: DigestStore[];
  week: string;
  appUrl: string;
}): { subject: string; html: string } {
  const self = opts.stores.find((s) => s.kind === "self");
  const selfDelta = self?.delta ?? null;

  const subject =
    selfDelta && selfDelta !== 0
      ? `Your store's conversion score moved ${selfDelta > 0 ? "+" : ""}${selfDelta} this week`
      : `Your weekly store check is ready`;

  const rows = opts.stores.map(row).join("");

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #ececec;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#0D9488;font-weight:600;">EliteVault · weekly check</div>
          <h1 style="margin:8px 0 4px;font-size:22px;color:#111827;">Here's what moved this week</h1>
          <p style="margin:0;color:#6b7280;font-size:13px;">Week of ${escapeHtml(opts.week)}. Scores are a fast conversion estimate of each store's homepage.</p>
        </td></tr>
        <tr><td style="padding:8px 28px 4px;">
          <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
        <tr><td style="padding:20px 28px 28px;">
          <a href="${opts.appUrl}/app/monitor" style="display:inline-block;background:#2DD4BF;color:#0A0A0F;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px;">Open your dashboard →</a>
          <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">You're getting this because you're monitoring stores in EliteVault. Manage or turn this off in your <a href="${opts.appUrl}/app/monitor" style="color:#0D9488;">monitor settings</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
