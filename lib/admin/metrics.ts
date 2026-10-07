import "server-only";
import type Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { PLANS } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";
import * as fp from "@/lib/admin/firstparty";
import { countryLabel } from "@/lib/admin/geo";
import { getResetAt } from "@/lib/admin/reset";
import { clampToReset } from "@/lib/admin/reset-core";
import { type Bounds, type Range, RANGES, bucketIndex, bucketLabel, guayaquilDay, rangeBounds } from "@/lib/admin/time";
import {
  abandonedAmountUsd,
  isValidSubStatus,
  revenueFromBalanceTransactions,
  type BalanceTxn,
  type Revenue,
} from "@/lib/admin/money";

/* ============================================================================
   Capa de métricas del panel del dueño.
   - Dinero: Stripe balance transactions (siempre USD de liquidación).
   - Usuarios, suscripciones, auditorías, tráfico: Supabase (service role).
   - Tráfico: SOLO first-party (/api/track → page_views/sessions/visitors).
   - Zona horaria fija America/Guayaquil; todo recortado al "reset a 0".
   Todo degrada con elegancia: si algo falla devuelve ceros en vez de romper.
   ============================================================================ */

export type { Range };
export { RANGES };

const VALID_STATUSES = ["active", "trialing", "past_due"];
const iso = (ms: number) => new Date(ms).toISOString();
const minutesSince = (isoStr: string | null) => (isoStr ? Math.max(0, Math.round((Date.now() - Date.parse(isoStr)) / 60000)) : 0);
const planLabel = (plan: PlanTier) => (plan === "pro" ? "Pro" : plan === "scale" ? "Scale" : "Free");
const planValue = (plan: PlanTier) => PLANS[plan]?.price.month ?? 0;

const STRIPE_CAP = 5000; // tope de seguridad de paginación

/** Window clamped to the reset point. */
type Win = { gte: number; lte: number };
async function clamp(gte: number, lte: number): Promise<Win> {
  const reset = await getResetAt();
  return { gte: clampToReset(gte, reset), lte };
}

/* ---------------------- Supabase (datos propios) ---------------------- */
async function countProfiles(gte: number, lte: number): Promise<number> {
  try {
    const supa = createSupabaseServiceClient();
    const w = await clamp(gte, lte);
    const { count } = await supa.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", iso(w.gte)).lt("created_at", iso(w.lte));
    return count ?? 0;
  } catch { return 0; }
}
/** Nuevas suscripciones REALES (excluye incomplete/canceled/unpaid…). */
async function countSubs(gte: number, lte: number): Promise<number> {
  try {
    const supa = createSupabaseServiceClient();
    const w = await clamp(gte, lte);
    const { count } = await supa
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("status", VALID_STATUSES)
      .gte("created_at", iso(w.gte))
      .lt("created_at", iso(w.lte));
    return count ?? 0;
  } catch { return 0; }
}
async function distinctAuditUsers(gte: number, lte: number): Promise<number> {
  try {
    const w = await clamp(gte, lte);
    const [r] = await rpcRows<number>("ov_audit_users", { p_from: iso(w.gte), p_to: iso(w.lte) });
    return Number(r) || 0;
  } catch { return 0; }
}
async function rpcRows<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const supa = createSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supa as any).rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return Array.isArray(data) ? (data as T[]) : data == null ? [] : [data as T];
}
async function bucketCounts(table: "subscriptions" | "profiles", b: Bounds): Promise<number[]> {
  const buckets = new Array(b.points).fill(0);
  try {
    const w = await clamp(b.gte, b.lte);
    if (w.gte >= w.lte) return buckets;
    const rows = await rpcRows<{ idx: number; n: number }>("ov_bucket_counts", {
      p_table: table,
      p_from: iso(w.gte), // rows before the reset are excluded…
      p_to: iso(w.lte),
      p_origin: iso(b.gte), // …but the bucket grid stays the chart's
      p_step_seconds: b.stepMs / 1000,
      p_points: b.points,
      p_valid_only: table === "subscriptions",
    });
    for (const r of rows) buckets[Number(r.idx)] += Number(r.n);
  } catch { /* deja ceros */ }
  return buckets;
}

/* ---------------------- Stripe (dinero, USD) ---------------------- */
const revCache = new Map<string, { at: number; rev: Revenue }>();

async function revenueOver(gte: number, lte: number, b?: Bounds): Promise<Revenue> {
  const w = await clamp(gte, lte);
  const points = b ? b.points : 1;
  const key = `${w.gte}-${Math.floor(w.lte / 30000)}-${points}`;
  const hit = revCache.get(key);
  if (hit && Date.now() - hit.at < 30000) return hit.rev;
  const txns: BalanceTxn[] = [];
  try {
    let n = 0;
    for await (const t of stripe.balanceTransactions.list({
      created: { gte: Math.floor(w.gte / 1000), lte: Math.floor(w.lte / 1000) },
      limit: 100,
      expand: ["data.source"],
    })) {
      if (t.type !== "charge" && t.type !== "payment") continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const src = t.source as any;
      const cust = src && typeof src === "object" ? src.customer : null;
      txns.push({
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        created: t.created,
        customer: typeof cust === "string" ? cust : cust?.id ?? null,
        country: src && typeof src === "object" ? src.billing_details?.address?.country ?? null : null,
      });
      if (++n >= STRIPE_CAP) break;
    }
  } catch { /* degradar */ }
  const rev = revenueFromBalanceTransactions(txns, b ? (ms) => bucketIndex(ms, b) : () => 0, points);
  revCache.set(key, { at: Date.now(), rev });
  return rev;
}

async function checkoutStats(gte: number, lte: number): Promise<{ created: number; completed: number }> {
  let created = 0, completed = 0, n = 0;
  try {
    const w = await clamp(gte, lte);
    for await (const s of stripe.checkout.sessions.list({ created: { gte: Math.floor(w.gte / 1000), lte: Math.floor(w.lte / 1000) }, limit: 100 })) {
      created++;
      if (s.status === "complete" || s.payment_status === "paid") completed++;
      if (++n >= STRIPE_CAP) break;
    }
  } catch { /* degradar */ }
  return { created, completed };
}

/* ============================================================================
   API pública del módulo
   ============================================================================ */
export async function getKpis(range: Range) {
  const b = rangeBounds(range);
  const [rev, prevRev, orders, signups, prevOrders, prevSignups] = await Promise.all([
    revenueOver(b.gte, b.lte), revenueOver(b.prevGte, b.prevLte),
    countSubs(b.gte, b.lte), countProfiles(b.gte, b.lte),
    countSubs(b.prevGte, b.prevLte), countProfiles(b.prevGte, b.prevLte),
  ]);
  const revenue = rev.total, prevRevenue = prevRev.total;
  // Ingreso por nueva suscripción (NO es ARPU: ARPU real = MRR / suscriptores activos, ver business-state).
  const revenuePerSub = orders ? revenue / orders : 0;
  const prevPerSub = prevOrders ? prevRevenue / prevOrders : 0;
  const conv = signups ? (orders / signups) * 100 : 0; // registro → suscripción de pago
  const prevConv = prevSignups ? (prevOrders / prevSignups) * 100 : 0;
  const d = (a: number, p: number) => (p ? ((a - p) / p) * 100 : 0);
  return {
    revenue, orders, revenuePerSub, conversionRate: conv,
    deltas: { revenue: d(revenue, prevRevenue), orders: d(orders, prevOrders), revenuePerSub: d(revenuePerSub, prevPerSub), conversionRate: conv - prevConv },
  };
}

export async function getRevenueSeries(range: Range) {
  const b = rangeBounds(range);
  const [rev, subs, signups] = await Promise.all([revenueOver(b.gte, b.lte, b), bucketCounts("subscriptions", b), bucketCounts("profiles", b)]);
  return Array.from({ length: b.points }, (_, i) => ({
    t: bucketLabel(i, b),
    revenue: Math.round(rev.buckets[i]),
    orders: subs[i],
    signups: signups[i],
    conversion: signups[i] ? (subs[i] / signups[i]) * 100 : 0,
  }));
}

export async function getFunnel(range: Range) {
  const b = rangeBounds(range);
  const [signups, activated, co] = await Promise.all([
    countProfiles(b.gte, b.lte), distinctAuditUsers(b.gte, b.lte), checkoutStats(b.gte, b.lte),
  ]);
  const stages = [
    { stage: "Registro (free)", count: signups },
    { stage: "Activación (1ª auditoría)", count: activated },
    { stage: "Inició checkout", count: co.created },
    { stage: "Pago completado", count: co.completed },
  ];
  try {
    const w = await clamp(b.gte, b.lte);
    const visits = await fp.fpVisits(w.gte, w.lte);
    if (visits > 0) stages.unshift({ stage: "Visitas", count: visits });
  } catch { /* sin tráfico */ }
  return stages;
}

/** "Casi pagan": checkouts abiertos/expirados con email real, plan, USD y canal. */
export async function getAlmostBuyers(range: Range) {
  const b = rangeBounds(range);
  type Row = {
    id: string; email: string | null; plan: string; interval: "month" | "year"; valueUsd: number;
    status: "Abierto" | "Expirado"; channel: string | null; lastSeen: number; followed: boolean;
  };
  const sessions: Stripe.Checkout.Session[] = [];
  try {
    const w = await clamp(b.gte, b.lte);
    let n = 0;
    for await (const s of stripe.checkout.sessions.list({
      created: { gte: Math.floor(w.gte / 1000), lte: Math.floor(w.lte / 1000) },
      limit: 100,
      expand: ["data.line_items"],
    })) {
      if (s.status === "complete" || s.payment_status === "paid") continue;
      sessions.push(s);
      if (++n >= 60) break;
    }
  } catch { return [] as Row[]; }
  if (!sessions.length) return [] as Row[];

  const userIds = [...new Set(sessions.map((s) => s.metadata?.supabase_user_id).filter((x): x is string => !!x))];
  const profileById: Record<string, { email: string; acq_channel: string | null }> = {};
  let followed = new Set<string>();
  try {
    const supa = createSupabaseServiceClient();
    if (userIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supa.from("profiles") as any).select("id, email, acq_channel").in("id", userIds);
      for (const p of (data ?? []) as Array<{ id: string; email: string; acq_channel: string | null }>) profileById[p.id] = p;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: f } = await (supa.from("checkout_followups") as any).select("session_id").in("session_id", sessions.map((s) => s.id));
    followed = new Set(((f ?? []) as Array<{ session_id: string }>).map((r) => r.session_id));
  } catch { /* sin perfiles / sin tabla */ }

  return sessions
    .map((s): Row => {
      const planKey = (s.metadata?.plan as PlanTier | undefined) ?? undefined;
      const plan = planKey && PLANS[planKey] ? planKey : null;
      const interval = (s.line_items?.data?.[0]?.price?.recurring?.interval === "year" ? "year" : "month") as "month" | "year";
      const list = plan ? PLANS[plan].price[interval] : 0;
      const prof = s.metadata?.supabase_user_id ? profileById[s.metadata.supabase_user_id] : undefined;
      return {
        id: s.id,
        email: prof?.email || s.customer_details?.email || null,
        plan: plan ? planLabel(plan) : "—",
        interval,
        valueUsd: abandonedAmountUsd(
          { currency: s.currency, amount_total: s.amount_total, currency_conversion: s.currency_conversion },
          list,
        ),
        status: s.status === "open" ? "Abierto" : "Expirado",
        channel: prof?.acq_channel ?? null,
        lastSeen: Math.round((Date.now() / 1000 - s.created) / 60),
        followed: followed.has(s.id),
      };
    })
    .sort((a, c) => a.lastSeen - c.lastSeen)
    .slice(0, 12);
}

export async function getRecentSubscriptions() {
  try {
    const supa = createSupabaseServiceClient();
    const reset = iso(await getResetAt());
    const { data: subs } = await supa
      .from("subscriptions")
      .select("id, user_id, plan, status, created_at")
      .in("status", VALID_STATUSES)
      .gte("created_at", reset)
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (subs ?? []) as Array<{ id: string; user_id: string; plan: PlanTier; status: string; created_at: string }>;
    const ids = rows.map((s) => s.user_id);
    const emailById: Record<string, string> = {};
    const custById: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supa.from("profiles").select("id, email, stripe_customer_id").in("id", ids);
      for (const p of (profs ?? []) as Array<{ id: string; email: string; stripe_customer_id: string | null }>) {
        emailById[p.id] = p.email;
        if (p.stripe_customer_id) custById[p.id] = p.stripe_customer_id;
      }
    }
    const countryByUser: Record<string, string> = {};
    await Promise.all(
      Object.entries(custById).map(async ([uid, cid]) => {
        try {
          const c = await stripe.customers.retrieve(cid);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cc = (c as any)?.address?.country || (c as any)?.shipping?.address?.country || null;
          if (cc) countryByUser[uid] = cc;
        } catch { /* ignore */ }
      }),
    );
    return rows.map((s) => ({
      id: s.id.slice(0, 14),
      customer: emailById[s.user_id] || s.user_id.slice(0, 8),
      plan: planLabel(s.plan),
      value: planValue(s.plan),
      country: countryByUser[s.user_id] ? countryLabel(countryByUser[s.user_id]) : "—",
      time: minutesSince(s.created_at),
    }));
  } catch { return []; }
}

export async function getLiveVisitors() {
  try { return await fp.fpLiveVisitors(); } catch { return { count: 0, sessions: [], source: "firstparty" as const }; }
}

export async function getDemographics(range: Range) {
  const b = rangeBounds(range);
  const w = await clamp(b.gte, b.lte);
  const safe = async <T>(p: Promise<T>, d: T): Promise<T> => { try { return await p; } catch { return d; } };
  const [rev, devices, newVsReturning] = await Promise.all([
    revenueOver(b.gte, b.lte),
    safe(fp.fpDevices(w.gte, w.lte), [] as Array<{ name: string; value: number }>),
    safe(fp.fpNewVsReturning(w.gte, w.lte), [] as Array<{ name: string; value: number }>),
  ]);
  const countries = Object.entries(rev.byCountry)
    .map(([cc, v]) => ({ name: countryLabel(cc === "??" ? null : cc), value: Math.round(v) }))
    .filter((c) => c.value > 0)
    .sort((a, c) => c.value - a.value);
  return { countries, devices, newVsReturning, source: "firstparty" as const };
}

/** Fuentes de tráfico por canal normalizado, con % de visitantes únicos. */
export async function getChannels(range: Range) {
  const b = rangeBounds(range);
  const w = await clamp(b.gte, b.lte);
  let rows: Array<{ name: string; value: number }> = [];
  try { rows = await fp.fpChannels(w.gte, w.lte); } catch { /* vacío */ }
  const total = rows.reduce((a, r) => a + r.value, 0);
  return { total, channels: rows.map((r) => ({ ...r, pct: total ? (r.value / total) * 100 : 0 })) };
}

/** Canales → dinero: visitantes · registros · conversión · pagos · ingresos USD. */
export async function getChannelRevenue(range: Range) {
  const b = rangeBounds(range);
  const w = await clamp(b.gte, b.lte);
  let funnel: Array<{ channel: string; visitors: number; signups: number }> = [];
  try { funnel = await fp.fpChannelFunnel(w.gte, w.lte); } catch { /* vacío */ }
  const rev = await revenueOver(b.gte, b.lte);

  // Cliente de Stripe → canal de adquisición (profiles.acq_channel), por lotes.
  const channelOfCustomer: Record<string, string> = {};
  const custIds = Object.keys(rev.byCustomer);
  try {
    const supa = createSupabaseServiceClient();
    for (let i = 0; i < custIds.length; i += 80) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supa.from("profiles") as any).select("stripe_customer_id, acq_channel").in("stripe_customer_id", custIds.slice(i, i + 80));
      for (const p of (data ?? []) as Array<{ stripe_customer_id: string; acq_channel: string | null }>) {
        channelOfCustomer[p.stripe_customer_id] = p.acq_channel || "Sin atribuir";
      }
    }
  } catch { /* sin atribución */ }

  const money: Record<string, { payments: number; revenue: number }> = {};
  for (const cid of custIds) {
    const ch = channelOfCustomer[cid] || "Sin atribuir";
    const m = (money[ch] = money[ch] || { payments: 0, revenue: 0 });
    m.payments += rev.countByCustomer[cid] || 0;
    m.revenue += rev.byCustomer[cid] || 0;
  }
  const names = new Set([...funnel.map((f) => f.channel), ...Object.keys(money)]);
  return [...names]
    .map((channel) => {
      const f = funnel.find((x) => x.channel === channel);
      const m = money[channel];
      const visitors = f?.visitors ?? 0, signups = f?.signups ?? 0;
      return {
        channel, visitors, signups,
        conversion: visitors ? (signups / visitors) * 100 : 0,
        payments: m?.payments ?? 0,
        revenue: Math.round((m?.revenue ?? 0) * 100) / 100,
      };
    })
    .sort((a, c) => c.revenue - a.revenue || c.signups - a.signups || c.visitors - a.visitors);
}

export async function getCampaigns(range: Range) {
  const b = rangeBounds(range);
  const w = await clamp(b.gte, b.lte);
  try { return await fp.fpCampaigns(w.gte, w.lte); } catch { return []; }
}

export async function getLandingPages(range: Range) {
  const b = rangeBounds(range);
  const w = await clamp(b.gte, b.lte);
  try { return await fp.fpLandingPages(w.gte, w.lte); } catch { return []; }
}

export async function getVisitorCountries(range: Range) {
  const b = rangeBounds(range);
  const w = await clamp(b.gte, b.lte);
  try { return await fp.fpVisitorCountries(w.gte, w.lte); } catch { return []; }
}

/** Salud del Analyzer: solo lee `analyses` (sin tocar el pipeline). */
export async function getAnalyzerHealth(range: Range) {
  const b = rangeBounds(range);
  const w = await clamp(b.gte, b.lte);
  const empty = { days: [] as Array<{ day: string; withSession: number; anonymous: number; succeeded: number; failed: number }>, total: 0, withSession: 0, anonymous: 0, successRate: 0, p50Sec: 0, p95Sec: 0, samples: 0 };
  try {
    const args = { p_from: iso(w.gte), p_to: iso(w.lte) };
    const [daily, lat] = await Promise.all([
      rpcRows<{ day: string; with_session: number; anonymous: number; succeeded: number; failed: number }>("ov_analyzer_daily", args),
      rpcRows<{ samples: number; p50_ms: number | null; p95_ms: number | null }>("ov_analyzer_latency", args),
    ]);
    const days = daily.map((d) => ({ day: String(d.day), withSession: Number(d.with_session), anonymous: Number(d.anonymous), succeeded: Number(d.succeeded), failed: Number(d.failed) }));
    const sum = (k: "withSession" | "anonymous" | "succeeded" | "failed") => days.reduce((a, d) => a + d[k], 0);
    const ok = sum("succeeded"), bad = sum("failed");
    return {
      days, total: sum("withSession") + sum("anonymous"), withSession: sum("withSession"), anonymous: sum("anonymous"),
      successRate: ok + bad ? (ok / (ok + bad)) * 100 : 0,
      p50Sec: lat[0]?.p50_ms ? Number(lat[0].p50_ms) / 1000 : 0,
      p95Sec: lat[0]?.p95_ms ? Number(lat[0].p95_ms) / 1000 : 0,
      samples: Number(lat[0]?.samples) || 0,
    };
  } catch { return empty; }
}

/** Cancelaciones del periodo y churn simple (canceladas / (activas + canceladas)). */
export async function getCancellations(range: Range) {
  const b = rangeBounds(range);
  try {
    const supa = createSupabaseServiceClient();
    const w = await clamp(b.gte, b.lte);
    const [canceled, active] = await Promise.all([
      supa.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "canceled").gte("updated_at", iso(w.gte)).lt("updated_at", iso(w.lte)),
      supa.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"]),
    ]);
    const c = canceled.count ?? 0, a = active.count ?? 0;
    return { canceled: c, active: a, churnPct: c + a ? (c / (c + a)) * 100 : 0, day: guayaquilDay(Date.now()) };
  } catch { return { canceled: 0, active: 0, churnPct: 0, day: guayaquilDay(Date.now()) }; }
}

/** Estado del negocio AHORA (no por periodo): MRR, suscriptores activos, usuarios, planes. */
export async function getBusinessState() {
  const resetMs = await getResetAt();
  const resetIso = iso(resetMs);
  try {
    const supa = createSupabaseServiceClient();
    const planCounts: Record<PlanTier, number> = { free: 0, pro: 0, scale: 0 };
    const [usersRes, freeRes, proRes, scaleRes, subsRes] = await Promise.all([
      supa.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", resetIso),
      supa.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "free").gte("created_at", resetIso),
      supa.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "pro").gte("created_at", resetIso),
      supa.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "scale").gte("created_at", resetIso),
      supa.from("subscriptions").select("plan, price_id, status").in("status", ["active", "trialing"]).gte("created_at", resetIso),
    ]);
    planCounts.free = freeRes.count ?? 0;
    planCounts.pro = proRes.count ?? 0;
    planCounts.scale = scaleRes.count ?? 0;

    const subs = (subsRes.data ?? []) as Array<{ plan: PlanTier; price_id: string | null; status: string }>;
    let mrr = 0;
    for (const s of subs) {
      const plan = PLANS[s.plan];
      if (!plan) continue;
      const isYearly = !!plan.stripePriceIds.year && s.price_id === plan.stripePriceIds.year;
      mrr += isYearly ? plan.price.year / 12 : plan.price.month;
    }
    return {
      mrr: Math.round(mrr), activeSubscribers: subs.length, arpu: subs.length ? Math.round((mrr / subs.length) * 100) / 100 : 0,
      totalUsers: usersRes.count ?? 0, planCounts, resetAt: resetIso,
    };
  } catch {
    return { mrr: 0, activeSubscribers: 0, arpu: 0, totalUsers: 0, planCounts: { free: 0, pro: 0, scale: 0 }, resetAt: resetIso };
  }
}
