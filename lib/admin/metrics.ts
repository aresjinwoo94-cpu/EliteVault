import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { PLANS } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";

/* ============================================================================
   Capa de métricas del panel del dueño.
   - Dinero (ingresos, abandonos, países): Stripe.
   - Registros, auditorías, suscripciones: Supabase (service role, bypassa RLS).
   - Tráfico (en vivo, dispositivos, fuentes): demo por ahora (marcado source:'demo').
     Para tráfico real se conecta PostHog server-side (ver README del monitor).
   Todo degrada con elegancia: si Stripe/Supabase fallan, devuelve ceros en vez de romper.
   ============================================================================ */

export type Range = "today" | "7d" | "30d" | "90d";
export const RANGES: Range[] = ["today", "7d", "30d", "90d"];

type Bounds = { gte: number; lte: number; prevGte: number; prevLte: number; points: number; unit: "h" | "d" };

function bounds(range: Range): Bounds {
  const now = Date.now();
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const gte = d.getTime();
    return { gte, lte: now, prevGte: gte - 86400000, prevLte: gte, points: 24, unit: "h" };
  }
  const len = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const gte = now - len * 86400000;
  return { gte, lte: now, prevGte: gte - len * 86400000, prevLte: gte, points: len, unit: "d" };
}
const iso = (ms: number) => new Date(ms).toISOString();
const minutesSince = (isoStr: string | null) => (isoStr ? Math.max(0, Math.round((Date.now() - Date.parse(isoStr)) / 60000)) : 0);
function bucketIndex(tsMs: number, b: Bounds) {
  const size = b.unit === "h" ? 3600000 : 86400000;
  return Math.max(0, Math.min(b.points - 1, Math.floor((tsMs - b.gte) / size)));
}
function bucketLabel(i: number, b: Bounds) {
  if (b.unit === "h") return String(i).padStart(2, "0") + ":00";
  const back = b.points - 1 - i;
  return back === 0 ? "Hoy" : "-" + back + "d";
}
function planLabel(plan: PlanTier): string {
  return plan === "pro" ? "Pro" : plan === "scale" ? "Scale" : "Free";
}
function planValue(plan: PlanTier): number {
  return PLANS[plan]?.price.month ?? 0;
}

const COUNTRY: Record<string, string> = {
  US: "🇺🇸 Estados Unidos", MX: "🇲🇽 México", ES: "🇪🇸 España", CO: "🇨🇴 Colombia", AR: "🇦🇷 Argentina",
  GB: "🇬🇧 Reino Unido", CA: "🇨🇦 Canadá", CL: "🇨🇱 Chile", PE: "🇵🇪 Perú", BR: "🇧🇷 Brasil",
  DE: "🇩🇪 Alemania", FR: "🇫🇷 Francia", IT: "🇮🇹 Italia", NL: "🇳🇱 Países Bajos", AU: "🇦🇺 Australia",
};
const countryLabel = (cc?: string | null) => (cc && COUNTRY[cc]) || (cc ? "🏳 " + cc : "🏳 Desconocido");

const STRIPE_CAP = 5000; // tope de seguridad de paginación

/* ---------------------- Supabase (datos propios) ---------------------- */
async function countProfiles(gte: number, lte: number): Promise<number> {
  try {
    const supa = createSupabaseServiceClient();
    const { count } = await supa
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", iso(gte))
      .lt("created_at", iso(lte));
    return count ?? 0;
  } catch { return 0; }
}
async function countSubs(gte: number, lte: number): Promise<number> {
  try {
    const supa = createSupabaseServiceClient();
    const { count } = await supa
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", iso(gte))
      .lt("created_at", iso(lte));
    return count ?? 0;
  } catch { return 0; }
}
async function distinctAuditUsers(gte: number, lte: number): Promise<number> {
  try {
    const supa = createSupabaseServiceClient();
    const { data } = await supa
      .from("analyses")
      .select("user_id")
      .gte("created_at", iso(gte))
      .lt("created_at", iso(lte))
      .limit(10000);
    return new Set((data ?? []).map((r) => (r as { user_id: string }).user_id)).size;
  } catch { return 0; }
}
async function subBuckets(b: Bounds): Promise<number[]> {
  const buckets = new Array(b.points).fill(0);
  try {
    const supa = createSupabaseServiceClient();
    const { data } = await supa
      .from("subscriptions")
      .select("created_at")
      .gte("created_at", iso(b.gte))
      .lt("created_at", iso(b.lte))
      .limit(10000);
    for (const r of data ?? []) {
      const t = Date.parse((r as { created_at: string }).created_at);
      if (!Number.isNaN(t)) buckets[bucketIndex(t, b)]++;
    }
  } catch { /* deja ceros */ }
  return buckets;
}

/* ---------------------- Stripe (dinero) ---------------------- */
async function invoiceStats(b: Bounds): Promise<{ total: number; buckets: number[] }> {
  const buckets = new Array(b.points).fill(0);
  let total = 0, n = 0;
  try {
    for await (const inv of stripe.invoices.list({ status: "paid", created: { gte: Math.floor(b.gte / 1000), lte: Math.floor(b.lte / 1000) }, limit: 100 })) {
      const amt = (inv.amount_paid || 0) / 100;
      total += amt;
      buckets[bucketIndex(inv.created * 1000, b)] += amt;
      if (++n >= STRIPE_CAP) break;
    }
  } catch { /* degradar */ }
  return { total, buckets };
}
async function totalPaid(gte: number, lte: number): Promise<number> {
  let total = 0, n = 0;
  try {
    for await (const inv of stripe.invoices.list({ status: "paid", created: { gte: Math.floor(gte / 1000), lte: Math.floor(lte / 1000) }, limit: 100 })) {
      total += (inv.amount_paid || 0) / 100;
      if (++n >= STRIPE_CAP) break;
    }
  } catch { /* degradar */ }
  return total;
}
async function checkoutStats(gte: number, lte: number): Promise<{ created: number; completed: number }> {
  let created = 0, completed = 0, n = 0;
  try {
    for await (const s of stripe.checkout.sessions.list({ created: { gte: Math.floor(gte / 1000), lte: Math.floor(lte / 1000) }, limit: 100 })) {
      created++;
      if (s.status === "complete" || s.payment_status === "paid") completed++;
      if (++n >= STRIPE_CAP) break;
    }
  } catch { /* degradar */ }
  return { created, completed };
}
async function abandonedCheckouts(gte: number, lte: number) {
  const out: Array<{ id: string; email: string | null; plan: string; value: number; stage: string; lastSeen: number }> = [];
  let n = 0;
  try {
    for await (const s of stripe.checkout.sessions.list({ created: { gte: Math.floor(gte / 1000), lte: Math.floor(lte / 1000) }, limit: 100 })) {
      if (s.status === "complete" || s.payment_status === "paid") continue;
      const cents = s.amount_total || 0;
      out.push({
        id: s.id,
        email: s.customer_details?.email || null,
        plan: cents === PLANS.pro.price.month * 100 ? "Pro" : cents === PLANS.scale.price.month * 100 ? "Scale" : cents ? "$" + cents / 100 : "—",
        value: cents / 100,
        stage: "Checkout",
        lastSeen: Math.round((Date.now() / 1000 - s.created) / 60),
      });
      if (++n >= 60) break;
    }
  } catch { /* degradar */ }
  return out.sort((a, c) => a.lastSeen - c.lastSeen).slice(0, 12);
}
async function chargesByCountry(b: Bounds) {
  const byCountry: Record<string, number> = {};
  let n = 0;
  try {
    for await (const ch of stripe.charges.list({ created: { gte: Math.floor(b.gte / 1000), lte: Math.floor(b.lte / 1000) }, limit: 100 })) {
      if (!ch.paid) continue;
      const cc = ch.billing_details?.address?.country || "??";
      byCountry[cc] = (byCountry[cc] || 0) + (ch.amount || 0) / 100;
      if (++n >= STRIPE_CAP) break;
    }
  } catch { /* degradar */ }
  return Object.entries(byCountry)
    .map(([cc, v]) => ({ name: countryLabel(cc), value: Math.round(v) }))
    .sort((a, c) => c.value - a.value);
}

/* ---------------------- Tráfico (demo; PostHog opcional vía README) ---------------------- */
const VISITORS_BASE: Record<Range, number> = { today: 900, "7d": 7200, "30d": 31000, "90d": 92000 };
const DEMO_COUNTRIES: Array<[string, number]> = [["US", 0.36], ["MX", 0.16], ["ES", 0.12], ["CO", 0.09], ["AR", 0.07], ["GB", 0.06], ["CA", 0.05], ["CL", 0.05], ["PE", 0.04]];
const CITIES: Record<string, string[]> = { US: ["Miami", "Austin", "Nueva York"], MX: ["CDMX", "Guadalajara"], ES: ["Madrid", "Barcelona"], CO: ["Bogotá"], AR: ["Buenos Aires"], GB: ["Londres"], CA: ["Toronto"], CL: ["Santiago"], PE: ["Lima"] };
const DEVICES = ["Móvil", "Escritorio", "Tablet"];
const PAGES = ["/", "/app/analyzer", "/app/library", "/pricing", "/app/checkout", "/app", "/docs"];
const SOURCES: Array<[string, number]> = [["Búsqueda orgánica", 0.26], ["Anuncios Meta", 0.24], ["Twitter/X", 0.16], ["YouTube", 0.13], ["Directo", 0.12], ["Comunidades", 0.09]];
const pickW = (arr: Array<[string, number]>) => { const r = Math.random(); let acc = 0; for (const [k, w] of arr) { acc += w; if (r <= acc) return k; } return arr[arr.length - 1][0]; };
const randItem = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function demoLive() {
  const h = new Date().getHours();
  const dayFactor = 0.45 + 0.55 * Math.max(0, Math.sin((h / 24) * Math.PI));
  const count = Math.max(6, Math.round(40 * dayFactor + (Math.random() * 14 - 7)));
  const sessions = Array.from({ length: Math.min(9, count) }, (_, i) => {
    const cc = pickW(DEMO_COUNTRIES);
    return { id: "S" + i + Math.floor(Math.random() * 999), country: countryLabel(cc), city: (CITIES[cc] && randItem(CITIES[cc])) || "—", device: randItem(DEVICES), page: randItem(PAGES), durationSec: Math.round(5 + Math.random() * 600) };
  });
  return { count, sessions, source: "demo" as const };
}
function demoTrafficDemographics(range: Range) {
  const v = VISITORS_BASE[range];
  return {
    devices: [{ name: "Móvil", value: Math.round(v * 0.54) }, { name: "Escritorio", value: Math.round(v * 0.39) }, { name: "Tablet", value: Math.round(v * 0.07) }],
    sources: SOURCES.map(([name, w]) => ({ name, value: Math.round(v * w) })),
    newVsReturning: [{ name: "Nuevos", value: Math.round(v * 0.61) }, { name: "Recurrentes", value: Math.round(v * 0.39) }],
    source: "demo" as const,
  };
}

/* ============================================================================
   API pública del módulo
   ============================================================================ */
export async function getKpis(range: Range) {
  const b = bounds(range);
  const [revenue, orders, signups, prevRevenue, prevOrders, prevSignups] = await Promise.all([
    totalPaid(b.gte, b.lte), countSubs(b.gte, b.lte), countProfiles(b.gte, b.lte),
    totalPaid(b.prevGte, b.prevLte), countSubs(b.prevGte, b.prevLte), countProfiles(b.prevGte, b.prevLte),
  ]);
  const aov = orders ? revenue / orders : 0;
  const prevAov = prevOrders ? prevRevenue / prevOrders : 0;
  const conv = signups ? (orders / signups) * 100 : 0;          // registro → suscripción de pago
  const prevConv = prevSignups ? (prevOrders / prevSignups) * 100 : 0;
  const d = (a: number, p: number) => (p ? ((a - p) / p) * 100 : 0);
  return {
    revenue, orders, aov, conversionRate: conv,
    deltas: { revenue: d(revenue, prevRevenue), orders: d(orders, prevOrders), aov: d(aov, prevAov), conversionRate: conv - prevConv },
  };
}

export async function getRevenueSeries(range: Range) {
  const b = bounds(range);
  const [inv, subs] = await Promise.all([invoiceStats(b), subBuckets(b)]);
  return Array.from({ length: b.points }, (_, i) => ({ t: bucketLabel(i, b), revenue: Math.round(inv.buckets[i]), orders: subs[i] }));
}

export async function getFunnel(range: Range) {
  const b = bounds(range);
  const [signups, activated, co] = await Promise.all([
    countProfiles(b.gte, b.lte), distinctAuditUsers(b.gte, b.lte), checkoutStats(b.gte, b.lte),
  ]);
  return [
    { stage: "Registro (free)", count: signups },
    { stage: "Activación (1ª auditoría)", count: activated },
    { stage: "Inició checkout", count: co.created },
    { stage: "Pago completado", count: co.completed },
  ];
}

export async function getAlmostBuyers(range: Range) {
  const b = bounds(range);
  return abandonedCheckouts(b.gte, b.lte);
}

export async function getRecentSubscriptions() {
  try {
    const supa = createSupabaseServiceClient();
    const { data: subs } = await supa
      .from("subscriptions")
      .select("id, user_id, plan, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (subs ?? []) as Array<{ id: string; user_id: string; plan: PlanTier; created_at: string }>;
    const ids = rows.map((s) => s.user_id);
    const emailById: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supa.from("profiles").select("id, email").in("id", ids);
      for (const p of (profs ?? []) as Array<{ id: string; email: string }>) emailById[p.id] = p.email;
    }
    return rows.map((s) => ({
      id: s.id.slice(0, 14),
      customer: emailById[s.user_id] || s.user_id.slice(0, 8),
      plan: planLabel(s.plan),
      value: planValue(s.plan),
      country: "—",
      time: minutesSince(s.created_at),
    }));
  } catch { return []; }
}

export async function getLiveVisitors() {
  // Tráfico en vivo: PostHog (server) opcional → por ahora demo marcado.
  return demoLive();
}

export async function getDemographics(range: Range) {
  const b = bounds(range);
  const [countries, traffic] = await Promise.all([chargesByCountry(b), Promise.resolve(demoTrafficDemographics(range))]);
  return {
    countries: countries.length ? countries : [{ name: "Sin cargos en el rango", value: 1 }],
    devices: traffic.devices,
    sources: traffic.sources,
    newVsReturning: traffic.newVsReturning,
  };
}
