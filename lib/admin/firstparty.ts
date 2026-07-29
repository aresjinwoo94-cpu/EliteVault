import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/* ============================================================================
   Analítica first-party: consulta la tabla `page_views` (poblada por /api/track).
   Da tráfico real (visitantes en vivo, dispositivos, fuentes, nuevos-vs-recurrentes,
   visitas para el embudo) sin depender de PostHog. Bajo volumen → agregación en JS.
   ============================================================================ */

const COUNTRY: Record<string, string> = {
  US: "🇺🇸 Estados Unidos", MX: "🇲🇽 México", ES: "🇪🇸 España", CO: "🇨🇴 Colombia", AR: "🇦🇷 Argentina",
  GB: "🇬🇧 Reino Unido", CA: "🇨🇦 Canadá", CL: "🇨🇱 Chile", PE: "🇵🇪 Perú", BR: "🇧🇷 Brasil",
  DE: "🇩🇪 Alemania", FR: "🇫🇷 Francia", IT: "🇮🇹 Italia", NL: "🇳🇱 Países Bajos", AU: "🇦🇺 Australia",
};
const flag = (cc?: string | null) => (cc && COUNTRY[cc]) || (cc ? "🌐 " + cc : "🌐 Desconocido");
const iso = (ms: number) => new Date(ms).toISOString();

type Row = { anon_id: string; path: string | null; referrer_domain: string | null; country: string | null; city: string | null; device: string | null; created_at: string };

async function fetchRange(gteMs: number, lteMs: number, limit = 10000): Promise<Row[]> {
  const supa = createSupabaseServiceClient();
  const { data } = await supa
    .from("page_views")
    .select("anon_id, path, referrer_domain, country, city, device, created_at")
    .gte("created_at", iso(gteMs))
    .lt("created_at", iso(lteMs))
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Row[];
}

/** ¿La tabla existe y tiene algún dato? (decide real vs demo) */
export async function fpHasAnyData(): Promise<boolean> {
  try {
    const supa = createSupabaseServiceClient();
    const { count, error } = await supa.from("page_views").select("id", { count: "exact", head: true });
    if (error) return false; // tabla aún no creada (migración no aplicada)
    return (count ?? 0) > 0;
  } catch { return false; }
}

const ACTIVE_WINDOW_MS = 45000; // a session is "live" if seen in the last 45s

type LiveSession = { id: string; country: string; city: string; device: string; page: string; durationSec: number; internal: boolean };

/**
 * Live visitors + session duration, from the `sessions` table (heartbeat).
 * A session is active when last_seen_at is within the last ~45s. DURATION =
 * last_seen_at − started_at. Internal (owner) sessions are INCLUDED and flagged
 * so the owner can see tracking works — public metrics exclude internal
 * elsewhere (page_views). Returns empty on error / missing table.
 */
export async function fpLiveVisitors() {
  const empty = { count: 0, sessions: [] as LiveSession[], source: "firstparty" as const };
  try {
    const supa = createSupabaseServiceClient();
    const cutoff = iso(Date.now() - ACTIVE_WINDOW_MS);
    const { data, error } = await supa
      .from("sessions")
      .select("session_id, country, city, device, path, started_at, last_seen_at, is_internal")
      .gte("last_seen_at", cutoff)
      .order("last_seen_at", { ascending: false })
      .limit(50);
    if (error || !Array.isArray(data)) return empty;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[];
    const sessions: LiveSession[] = rows.slice(0, 12).map((r) => {
      const durMs = Date.parse(r.last_seen_at) - Date.parse(r.started_at);
      return {
        id: String(r.session_id).slice(0, 8),
        country: flag(r.country),
        city: r.city || "—",
        device: r.device || "—",
        page: r.path || "/",
        durationSec: Number.isFinite(durMs) ? Math.max(0, Math.round(durMs / 1000)) : 0,
        internal: !!r.is_internal,
      };
    });
    return { count: rows.length, sessions, source: "firstparty" as const };
  } catch {
    return empty;
  }
}

export async function fpVisits(gteMs: number, lteMs: number): Promise<number> {
  const rows = await fetchRange(gteMs, lteMs);
  return new Set(rows.map((r) => r.anon_id)).size;
}

export async function fpDemographics(gteMs: number, lteMs: number) {
  const rows = await fetchRange(gteMs, lteMs);
  const byDevice: Record<string, Set<string>> = {};
  const bySource: Record<string, Set<string>> = {};
  const rangeAnon = new Set<string>();
  for (const r of rows) {
    rangeAnon.add(r.anon_id);
    const d = r.device || "Desconocido";
    (byDevice[d] = byDevice[d] || new Set()).add(r.anon_id);
    const s = r.referrer_domain || "Directo";
    (bySource[s] = bySource[s] || new Set()).add(r.anon_id);
  }
  const devices = Object.entries(byDevice).map(([name, set]) => ({ name, value: set.size })).sort((a, b) => b.value - a.value);
  const sources = Object.entries(bySource).map(([name, set]) => ({ name, value: set.size })).sort((a, b) => b.value - a.value).slice(0, 8);

  // Nuevos vs recurrentes: de los visitantes del rango, cuántos ya existían antes.
  let returning = 0;
  if (rangeAnon.size) {
    try {
      const supa = createSupabaseServiceClient();
      const ids = [...rangeAnon].slice(0, 1000);
      const { data } = await supa.from("page_views").select("anon_id").lt("created_at", iso(gteMs)).in("anon_id", ids).limit(5000);
      returning = new Set((data ?? []).map((r) => (r as { anon_id: string }).anon_id)).size;
    } catch { /* deja returning=0 */ }
  }
  const total = rangeAnon.size;
  const newVsReturning = [{ name: "Nuevos", value: Math.max(0, total - returning) }, { name: "Recurrentes", value: returning }];

  return { devices, sources, newVsReturning, source: "firstparty" as const };
}
