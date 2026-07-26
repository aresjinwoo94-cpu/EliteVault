import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";

/**
 * One-click unsubscribe for the abandoned-checkout recovery sequence.
 *
 * The recovery emails link here with ?sid=<session_id>&t=<hmac>. We verify the
 * signature (no login needed), flip checkout_recovery.status to 'unsubscribed'
 * so the Inngest job stops sending, and confirm. CAN-SPAM: a working, no-login
 * opt-out plus sender identity in the email footer.
 *
 *   GET  — user clicked the link → mark unsubscribed, show a small confirmation.
 *   POST — RFC 8058 List-Unsubscribe-Post one-click → mark unsubscribed, 200.
 */

export const runtime = "nodejs";

async function unsubscribe(sid: string | null, t: string | null): Promise<boolean> {
  if (!sid || !t || !verifyUnsubscribe(sid, t)) return false;
  const service = createSupabaseServiceClient();
  // Don't resurrect a 'recovered' row into 'unsubscribed'; only pending ones
  // still send, so scoping the update to pending is enough and keeps intent.
  await service
    .from("checkout_recovery")
    .update({ status: "unsubscribed" })
    .eq("session_id", sid)
    .eq("status", "pending");
  return true;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ok = await unsubscribe(searchParams.get("sid"), searchParams.get("t"));
  const message = ok
    ? "You're unsubscribed. You won't get any more checkout reminders."
    : "This unsubscribe link is invalid or has expired.";
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Unsubscribe — EliteVault</title></head><body style="margin:0;background:#070D0B;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:64px 16px;"><tr><td align="center"><table width="480" cellpadding="0" cellspacing="0" style="background:#0B1512;border:1px solid #16211D;border-radius:16px;"><tr><td style="padding:32px;"><p style="margin:0 0 12px;color:#EAF6F1;font-size:18px;font-weight:700;">EliteVault</p><p style="margin:0;color:#9FB3AC;font-size:15px;line-height:1.6;">${message}</p></td></tr></table></td></tr></table></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ok = await unsubscribe(searchParams.get("sid"), searchParams.get("t"));
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
