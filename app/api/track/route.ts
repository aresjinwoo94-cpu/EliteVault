import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { interpretBeat, type BeatBody } from "@/lib/analytics/track";

/**
 * First-party analytics beacon. The client (components/analytics/page-tracker)
 * sends `type: "pageview"` on mount / route change and `type: "heartbeat"` every
 * ~15s while the tab is visible. It does three things:
 *   1. `sessions` — one row per browser session (session_id) for live visitors
 *      + duration. Channel / referrer / utm / landing are FIRST-TOUCH: written
 *      only when the row is created, never by later beats.
 *   2. `visitors` — one row per ev_anon visitor, first-touch, insert-only.
 *   3. `page_views` — ONLY for `type === "pageview"` and non-internal traffic
 *      (a heartbeat is not a page view).
 *
 * Public (anonymous visitors) but only WRITES via the service role. Never
 * returns data. Dev/preview hosts and known bots are dropped so localhost /
 * vercel.app traffic never pollutes production analytics.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deviceFromUA(ua: string): string {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return "Tablet";
  if (/mobi|iphone|android.*mobile/i.test(ua)) return "Móvil";
  return "Escritorio";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as BeatBody;
    const ua = req.headers.get("user-agent") || "";
    const host = req.headers.get("host") || "";
    const beat = interpretBeat(body, { ua, host });
    if (beat.drop) return new NextResponse(null, { status: 204 });

    const country = req.headers.get("x-vercel-ip-country");
    const cityRaw = req.headers.get("x-vercel-ip-city");
    const city = cityRaw ? decodeURIComponent(cityRaw) : null;

    let anon = req.cookies.get("ev_anon")?.value;
    const res = new NextResponse(null, { status: 204 });
    if (!anon) {
      anon = crypto.randomUUID();
      res.cookies.set("ev_anon", anon, {
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      });
    }

    const device = deviceFromUA(ua);
    const supa = createSupabaseServiceClient();
    const now = new Date().toISOString();

    if (body.session_id) {
      const sid = String(body.session_id).slice(0, 64);
      // Common case: the session exists → bump liveness only (first-touch
      // columns are never rewritten).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: bumped } = await (supa.from("sessions") as any)
        .update({ last_seen_at: now, path: beat.path })
        .eq("session_id", sid)
        .select("session_id");

      if (!bumped?.length) {
        // First beat of the session: insert with first-touch attribution.
        // ignoreDuplicates makes a racing second first-beat a no-op.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supa.from("sessions") as any).upsert(
          {
            session_id: sid,
            anon_id: anon,
            path: beat.path,
            landing_path: beat.path,
            referrer_domain: beat.referrerDomain,
            channel: beat.channel,
            utm_source: beat.utmSource,
            utm_medium: beat.utmMedium,
            utm_campaign: beat.utmCampaign,
            country: country || null,
            city,
            device,
            is_internal: beat.internal,
            last_seen_at: now,
          },
          { onConflict: "session_id", ignoreDuplicates: true },
        );
        if (!beat.internal) {
          // Visitor first-touch: only the very first session of this ev_anon
          // wins; later sessions hit the primary key and are ignored.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supa.from("visitors") as any).upsert(
            {
              anon_id: anon,
              first_channel: beat.channel,
              first_referrer_domain: beat.referrerDomain,
              first_landing_path: beat.path,
              utm_source: beat.utmSource,
              utm_medium: beat.utmMedium,
              utm_campaign: beat.utmCampaign,
              country: country || null,
              device,
            },
            { onConflict: "anon_id", ignoreDuplicates: true },
          );
        }
      }
    }

    if (beat.writePageView) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supa.from("page_views").insert({
        anon_id: anon,
        path: beat.path,
        referrer_domain: beat.referrerDomain,
        channel: beat.channel,
        country: country || null,
        city,
        device,
      } as any);
    }

    return res;
  } catch {
    return new NextResponse(null, { status: 204 }); // never break navigation
  }
}
