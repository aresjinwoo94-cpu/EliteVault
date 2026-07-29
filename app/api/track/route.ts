import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * First-party analytics beacon. The client (components/analytics/page-tracker)
 * calls it on every route change AND on a ~15s heartbeat while the tab is
 * visible. It does two things:
 *   1. `sessions` upsert — one row per browser session (session_id), so the
 *      owner dashboard can show live visitors + session DURATION. Recorded for
 *      EVERYONE, but the owner/admin is flagged `is_internal` (visible to them,
 *      excluded from public metrics).
 *   2. `page_views` insert — the per-pageview log powering demographics/funnel.
 *      Skipped for internal traffic so it never inflates the metrics.
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

// Known bots / preview crawlers — never counted as real visitors.
const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|pinterest|slackbot|vkshare|telegrambot|whatsapp|headless|lighthouse|pagespeed|gtmetrix|uptime|monitor|preview/i;

// Hosts we never record (local dev + Vercel preview deployments).
function isDevOrPreviewHost(host: string): boolean {
  return (
    host.includes("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0") ||
    host.endsWith(".vercel.app")
  );
}

// Referrers that are internal/dev noise → treated as "Directo".
function isNoiseReferrer(hostname: string): boolean {
  return (
    hostname.includes("localhost") ||
    hostname.startsWith("127.0.0.1") ||
    hostname.endsWith(".vercel.app") ||
    hostname === "vercel.com" ||
    hostname.endsWith(".vercel.com")
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      path?: string;
      referrer?: string;
      session_id?: string;
      internal?: boolean;
    };
    const ua = req.headers.get("user-agent") || "";
    const host = (req.headers.get("host") || "").replace(/^www\./, "");

    // §6 — drop dev/preview hosts and bots entirely.
    if (isDevOrPreviewHost(host) || BOT_RE.test(ua)) {
      return new NextResponse(null, { status: 204 });
    }

    const country = req.headers.get("x-vercel-ip-country");
    const cityRaw = req.headers.get("x-vercel-ip-city");
    const city = cityRaw ? decodeURIComponent(cityRaw) : null;

    let referrer_domain = "Directo";
    try {
      if (body.referrer) {
        const h = new URL(body.referrer).hostname.replace(/^www\./, "");
        if (h && h !== host && !isNoiseReferrer(h)) referrer_domain = h;
      }
    } catch {
      /* invalid referrer → Directo */
    }

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

    const path = (body.path || "").slice(0, 300) || null;
    const device = deviceFromUA(ua);
    const internal = !!body.internal;
    const supa = createSupabaseServiceClient();

    // §2 — session heartbeat (everyone, internal flagged). Upsert on
    // session_id: `started_at` is omitted so it keeps its original value on
    // update; `last_seen_at` is bumped every beat (server clock).
    if (body.session_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa.from("sessions") as any).upsert(
        {
          session_id: String(body.session_id).slice(0, 64),
          anon_id: anon,
          path,
          referrer_domain,
          country: country || null,
          city,
          device,
          is_internal: internal,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "session_id" },
      );
    }

    // page_views — only real (non-internal) traffic, so metrics stay clean.
    if (!internal) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supa.from("page_views").insert({
        anon_id: anon,
        path,
        referrer_domain,
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
