import "server-only";

/* ============================================================================
   PostHog (server-side) para el panel del dueño.
   Consulta tráfico real vía la Query API (HogQL). Necesita:
     POSTHOG_API_KEY     — Personal API Key (Settings → Personal API Keys)
     POSTHOG_PROJECT_ID  — id numérico del proyecto
     POSTHOG_API_HOST    — opcional; por defecto deriva de NEXT_PUBLIC_POSTHOG_HOST
                           (us.i.posthog.com → us.posthog.com)
   Si no está configurado, posthogEnabled() = false y metrics.ts cae a demo.
   ============================================================================ */

const KEY = process.env.POSTHOG_API_KEY || "";
const PROJECT = process.env.POSTHOG_PROJECT_ID || "";
const HOST = (
  process.env.POSTHOG_API_HOST ||
  (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com")
)
  .replace(/\/$/, "")
  .replace("us.i.posthog.com", "us.posthog.com")
  .replace("eu.i.posthog.com", "eu.posthog.com");

export function posthogEnabled(): boolean {
  return Boolean(KEY && PROJECT);
}

/** Ejecuta una consulta HogQL y devuelve las filas (array de arrays). */
async function hogql(query: string): Promise<any[][]> {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("PostHog " + res.status);
  const json = await res.json();
  return (json.results as any[][]) ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const dtUTC = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

const COUNTRY: Record<string, string> = {
  US: "🇺🇸 Estados Unidos", MX: "🇲🇽 México", ES: "🇪🇸 España", CO: "🇨🇴 Colombia", AR: "🇦🇷 Argentina",
  GB: "🇬🇧 Reino Unido", CA: "🇨🇦 Canadá", CL: "🇨🇱 Chile", PE: "🇵🇪 Perú", BR: "🇧🇷 Brasil",
  DE: "🇩🇪 Alemania", FR: "🇫🇷 Francia", IT: "🇮🇹 Italia", NL: "🇳🇱 Países Bajos", AU: "🇦🇺 Australia",
};
const flag = (cc?: string | null) => (cc && COUNTRY[cc]) || (cc ? "🌐 " + cc : "🌐 Desconocido");

/** Visitantes ahora mismo (últimos 5 min) + sesiones recientes. */
export async function phLiveVisitors() {
  const cnt = await hogql(
    `SELECT count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 5 MINUTE`,
  );
  const count = Number(cnt?.[0]?.[0] ?? 0);

  let sessions: Array<{ id: string; country: string; city: string; device: string; page: string; durationSec: number }> = [];
  try {
    const rows = await hogql(
      `SELECT properties.$geoip_country_code, properties.$geoip_city_name, properties.$device_type, properties.$pathname
       FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 15 MINUTE
       ORDER BY timestamp DESC LIMIT 9`,
    );
    sessions = (rows ?? []).map((r, i) => ({
      id: "ph" + i,
      country: flag(r[0] as string),
      city: (r[1] as string) || "—",
      device: (r[2] as string) || "—",
      page: (r[3] as string) || "/",
      durationSec: 0,
    }));
  } catch { /* deja sesiones vacías; el conteo sigue siendo real */ }

  return { count, sessions, source: "posthog" as const };
}

/** Dispositivos, fuentes y nuevos-vs-recurrentes en el rango. */
export async function phDemographics(gte: number, lte: number) {
  const g = dtUTC(gte), l = dtUTC(lte);

  let devices: Array<{ name: string; value: number }> = [];
  let sources: Array<{ name: string; value: number }> = [];
  let newVsReturning: Array<{ name: string; value: number }> = [];

  try {
    const rows = await hogql(
      `SELECT properties.$device_type, count(DISTINCT person_id) AS v
       FROM events WHERE event = '$pageview' AND timestamp >= toDateTime('${g}') AND timestamp < toDateTime('${l}')
       GROUP BY properties.$device_type ORDER BY v DESC`,
    );
    devices = (rows ?? []).map((r) => ({ name: (r[0] as string) || "Desconocido", value: Number(r[1]) }));
  } catch { /* degradar */ }

  try {
    const rows = await hogql(
      `SELECT coalesce(nullIf(properties.$referring_domain, ''), 'Directo') AS src, count(DISTINCT person_id) AS v
       FROM events WHERE event = '$pageview' AND timestamp >= toDateTime('${g}') AND timestamp < toDateTime('${l}')
       GROUP BY src ORDER BY v DESC LIMIT 8`,
    );
    sources = (rows ?? []).map((r) => ({ name: (r[0] as string) || "Directo", value: Number(r[1]) }));
  } catch { /* degradar */ }

  try {
    const rows = await hogql(
      `SELECT countIf(first_seen >= toDateTime('${g}')) AS nuevos, countIf(first_seen < toDateTime('${g}')) AS recurrentes
       FROM (SELECT person_id, min(timestamp) AS first_seen FROM events WHERE event = '$pageview'
             GROUP BY person_id HAVING max(timestamp) >= toDateTime('${g}') AND max(timestamp) < toDateTime('${l}'))`,
    );
    const nuevos = Number(rows?.[0]?.[0] ?? 0), recurrentes = Number(rows?.[0]?.[1] ?? 0);
    newVsReturning = [{ name: "Nuevos", value: nuevos }, { name: "Recurrentes", value: recurrentes }];
  } catch { /* degradar */ }

  return { devices, sources, newVsReturning, source: "posthog" as const };
}

/** Estado de configuración (sin exponer secretos). */
export function phConfig() {
  return { configured: posthogEnabled(), apiKeySet: Boolean(KEY), projectIdSet: Boolean(PROJECT), host: HOST };
}

/** Prueba de conexión real: ejecuta una consulta mínima y reporta resultado/error. */
export async function phTest(): Promise<{ ok: boolean; detail: string; eventsLast30min?: number }> {
  if (!posthogEnabled()) {
    return { ok: false, detail: "Faltan POSTHOG_API_KEY y/o POSTHOG_PROJECT_ID en las variables de entorno." };
  }
  try {
    const rows = await hogql(`SELECT count() FROM events WHERE timestamp > now() - INTERVAL 30 MINUTE`);
    return { ok: true, detail: "Conexión a PostHog OK", eventsLast30min: Number(rows?.[0]?.[0] ?? 0) };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/** Visitantes únicos en el rango (para el tope del embudo). */
export async function phVisits(gte: number, lte: number): Promise<number> {
  const g = dtUTC(gte), l = dtUTC(lte);
  const rows = await hogql(
    `SELECT count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND timestamp >= toDateTime('${g}') AND timestamp < toDateTime('${l}')`,
  );
  return Number(rows?.[0]?.[0] ?? 0);
}
