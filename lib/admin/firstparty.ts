import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { countryLabel } from "@/lib/admin/geo";

/* ============================================================================
   Analítica first-party del panel del dueño. Lee `page_views` / `sessions` /
   `visitors` (poblados por /api/track). TODA agregación ocurre en Postgres
   (funciones ov_* de la migración 0035): nada de traer miles de filas a JS.
   Quien llama pasa ventanas ya recortadas al reset (ver metrics.ts).
   ============================================================================ */

const iso = (ms: number) => new Date(ms).toISOString();

/** Calls an ov_* SQL function; throws on error so callers can degrade. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const supa = createSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supa as any).rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  if (Array.isArray(data)) return data as T[];
  return data == null ? [] : [data as T];
}

const win = (gte: number, lte: number) => ({ p_from: iso(gte), p_to: iso(lte) });

/** ¿La tabla existe y tiene algún dato? */
export async function fpHasAnyData(): Promise<boolean> {
  try {
    const supa = createSupabaseServiceClient();
    const { count, error } = await supa.from("page_views").select("id", { count: "exact", head: true });
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

const ACTIVE_WINDOW_MS = 45000; // a session is "live" if seen in the last 45s

export type LiveSession = {
  id: string;
  country: string;
  city: string;
  device: string;
  page: string;
  channel: string;
  durationSec: number;
  internal: boolean;
};

/**
 * Live visitors. "Live" is NOW, so the reset does not apply. The counter
 * EXCLUDES the owner's own (internal) sessions; those still appear in the list
 * flagged "tú" so tracking can be verified.
 */
export async function fpLiveVisitors() {
  const empty = { count: 0, sessions: [] as LiveSession[], source: "firstparty" as const };
  try {
    const supa = createSupabaseServiceClient();
    const cutoff = iso(Date.now() - ACTIVE_WINDOW_MS);
    const [list, external] = await Promise.all([
      supa
        .from("sessions")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("session_id, country, city, device, path, channel, started_at, last_seen_at, is_internal" as any)
        .gte("last_seen_at", cutoff)
        .order("last_seen_at", { ascending: false })
        .limit(50),
      supa.from("sessions").select("session_id", { count: "exact", head: true }).gte("last_seen_at", cutoff).eq("is_internal", false),
    ]);
    if (list.error || !Array.isArray(list.data)) return empty;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = list.data as any[];
    const sessions: LiveSession[] = rows.slice(0, 12).map((r) => {
      const durMs = Date.parse(r.last_seen_at) - Date.parse(r.started_at);
      return {
        id: String(r.session_id).slice(0, 8),
        country: countryLabel(r.country),
        city: r.city || "—",
        device: r.device || "—",
        page: r.path || "/",
        channel: r.channel || "Directo",
        durationSec: Number.isFinite(durMs) ? Math.max(0, Math.round(durMs / 1000)) : 0,
        internal: !!r.is_internal,
      };
    });
    return { count: external.count ?? 0, sessions, source: "firstparty" as const };
  } catch {
    return empty;
  }
}

export async function fpVisits(gte: number, lte: number): Promise<number> {
  const [r] = await rpc<number>("ov_visits", win(gte, lte));
  return Number(r) || 0;
}

type Named = { name: string; value: number };

export async function fpChannels(gte: number, lte: number): Promise<Named[]> {
  const rows = await rpc<{ channel: string; visitors: number }>("ov_channels", win(gte, lte));
  return rows.map((r) => ({ name: r.channel, value: Number(r.visitors) }));
}

export async function fpDevices(gte: number, lte: number): Promise<Named[]> {
  const rows = await rpc<{ device: string; visitors: number }>("ov_devices", win(gte, lte));
  return rows.map((r) => ({ name: r.device, value: Number(r.visitors) }));
}

export async function fpVisitorCountries(gte: number, lte: number): Promise<Named[]> {
  const rows = await rpc<{ country: string | null; visitors: number }>("ov_visitor_countries", win(gte, lte));
  return rows.map((r) => ({ name: countryLabel(r.country), value: Number(r.visitors) }));
}

/** One SQL query: of this window's visitors, how many were already known. */
export async function fpNewVsReturning(gte: number, lte: number): Promise<Named[]> {
  const [r] = await rpc<{ new_visitors: number; returning_visitors: number }>("ov_new_vs_returning", win(gte, lte));
  return [
    { name: "Nuevos", value: Number(r?.new_visitors) || 0 },
    { name: "Recurrentes", value: Number(r?.returning_visitors) || 0 },
  ];
}

export async function fpLandingPages(gte: number, lte: number) {
  const rows = await rpc<{ path: string; visitors: number; top_channel: string }>("ov_landing_pages", {
    ...win(gte, lte),
    p_limit: 10,
  });
  return rows.map((r) => ({ path: r.path, visitors: Number(r.visitors), channel: r.top_channel }));
}

export async function fpCampaigns(gte: number, lte: number) {
  const rows = await rpc<{ campaign: string; channel: string; visitors: number; signups: number }>("ov_campaigns", win(gte, lte));
  return rows.map((r) => ({ campaign: r.campaign, channel: r.channel, visitors: Number(r.visitors), signups: Number(r.signups) }));
}

export async function fpChannelFunnel(gte: number, lte: number) {
  const rows = await rpc<{ channel: string; visitors: number; signups: number }>("ov_channel_funnel", win(gte, lte));
  return rows.map((r) => ({ channel: r.channel, visitors: Number(r.visitors), signups: Number(r.signups) }));
}
