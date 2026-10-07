import { classifyChannel, parseLanding } from "@/lib/analytics/channel";
import { isBotUserAgent } from "@/lib/analytics/bots";

/**
 * Pure interpretation of one /api/track beacon (no I/O, unit-tested):
 * what to drop, which channel the session came from, and whether the beat is a
 * real pageview (only those become `page_views` rows — heartbeats don't).
 */

export type BeatBody = {
  type?: "pageview" | "heartbeat";
  path?: string;
  /** The session's ORIGINAL referrer (stored client-side at the first beat). */
  referrer?: string;
  /** The session's landing `location.search` (utm + click ids). */
  landing?: string;
  session_id?: string;
  internal?: boolean;
};

export type BeatContext = { ua: string; host: string };

export type Beat = {
  drop: boolean;
  type: "pageview" | "heartbeat";
  path: string | null;
  referrerDomain: string;
  channel: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  internal: boolean;
  writePageView: boolean;
};

// Hosts we never record (local dev + Vercel preview deployments).
export function isDevOrPreviewHost(host: string): boolean {
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

const cap = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null);

export function interpretBeat(body: BeatBody, ctx: BeatContext): Beat {
  const host = ctx.host.replace(/^www\./, "");
  const internal = !!body.internal;
  // Legacy clients (before `type` existed) only ever sent heartbeat-like beats.
  const type = body.type === "pageview" ? "pageview" : "heartbeat";
  const path = cap(body.path, 300);

  let referrerDomain = "Directo";
  try {
    if (body.referrer) {
      const h = new URL(body.referrer).hostname.replace(/^www\./, "");
      if (h && h !== host && !isNoiseReferrer(h)) referrerDomain = h;
    }
  } catch {
    /* invalid referrer → Directo */
  }

  const landing = parseLanding(body.landing);
  const channel = classifyChannel({
    utmSource: landing.utmSource,
    utmMedium: landing.utmMedium,
    clickIds: landing.clickIds,
    referrer: referrerDomain === "Directo" ? "" : body.referrer,
    ua: ctx.ua,
    ownHosts: [host],
  });

  return {
    drop: isDevOrPreviewHost(host) || isBotUserAgent(ctx.ua),
    type,
    path,
    referrerDomain,
    channel,
    utmSource: landing.utmSource,
    utmMedium: landing.utmMedium,
    utmCampaign: landing.utmCampaign,
    internal,
    writePageView: type === "pageview" && !internal,
  };
}
