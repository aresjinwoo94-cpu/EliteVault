"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect } from "react";

/**
 * Panel del dueño (isla vanilla dentro de React).
 *
 * Renderiza un esqueleto estático y, en un único useEffect, carga Chart.js desde
 * CDN y pinta los datos consultando /api/admin/metrics/* (misma sesión/cookies,
 * gateado por email de admin en el servidor). No re-renderiza vía React: actualiza
 * el DOM directamente, igual que un dashboard autónomo. CSS aislado bajo `.evm`.
 */
export function OwnerMonitor() {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const charts: Record<string, any> = {};
    let tick = 0;
    let currentRange: "today" | "7d" | "30d" | "90d" = "7d";
    let disposed = false;

    const $ = (id: string) => document.getElementById(id);
    const fmtMoney = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
    const fmtMoney2 = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);
    const fmtNum = (n: number) => new Intl.NumberFormat("es-MX").format(n || 0);
    const fmtPct = (n: number) => (n >= 0 ? "+" : "") + (Number(n) || 0).toFixed(1) + "%";
    const cssVar = (v: string) => getComputedStyle(document.querySelector(".evm") as Element).getPropertyValue(v).trim();
    const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);
    const timeAgo = (m: number) => (m < 1 ? "hace segundos" : m < 60 ? `hace ${Math.round(m)} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`);
    const durStr = (s: number) => { const m = Math.floor(s / 60); return m ? `${m}m ${s % 60}s` : `${s}s`; };

    async function api(path: string, params: Record<string, string> = {}) {
      const url = new URL(`/api/admin/metrics/${path}`, window.location.origin);
      Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) throw new Error("API " + res.status + " /" + path);
      return res.json();
    }

    function loadChart(): Promise<any> {
      return new Promise((resolve, reject) => {
        if ((window as any).Chart) return resolve((window as any).Chart);
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
        s.onload = () => resolve((window as any).Chart);
        s.onerror = () => reject(new Error("No se pudo cargar Chart.js"));
        document.head.appendChild(s);
      });
    }

    const theme = () => ({ text: cssVar("--text-dim"), grid: cssVar("--grid"), accent: cssVar("--accent"), accent2: cssVar("--accent-2"), green: cssVar("--green"), amber: cssVar("--amber"), red: cssVar("--red"), purple: cssVar("--purple") });
    const Chart = () => (window as any).Chart;

    function setDataState(kind: string, txt: string) {
      const dot = $("evm-dot"), st = $("evm-state");
      if (dot) dot.className = "sdot " + kind;
      if (st) st.textContent = txt;
    }
    function stamp() { const el = $("evm-refresh"); if (el) el.textContent = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    function setTag(id: string, source?: string) {
      const el = $(id); if (!el) return;
      if (source === "posthog") { el.textContent = "PostHog"; el.className = "tag"; }
      else if (source === "firstparty") { el.textContent = "real"; el.className = "tag"; }
      else { el.textContent = "demo"; el.className = "tag amber"; }
    }

    function drawSpark(id: string, data: number[], color: string) {
      const ctx = $(id) as HTMLCanvasElement | null; if (!ctx) return;
      if (charts[id]) charts[id].destroy();
      charts[id] = new (Chart())(ctx, {
        type: "line",
        data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 2, fill: true, backgroundColor: (c: any) => { const g = c.chart.ctx.createLinearGradient(0, 0, 0, 42); g.addColorStop(0, color + "55"); g.addColorStop(1, color + "00"); return g; }, pointRadius: 0, tension: 0.4 }] },
        options: { responsive: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, animation: false },
      });
    }
    function setDelta(id: string, val: number) {
      val = Number(val) || 0; const el = $(id); if (!el) return;
      const up = val >= 0; el.className = "delta " + (up ? "up" : "down");
      el.textContent = (up ? "▲ " : "▼ ") + fmtPct(val) + " vs periodo anterior";
    }

    async function renderKpis() {
      const t = theme();
      const k = await api("kpis", { range: currentRange });
      ($("evm-rev") as HTMLElement).textContent = fmtMoney(k.revenue);
      ($("evm-ord") as HTMLElement).textContent = fmtNum(k.orders);
      ($("evm-aov") as HTMLElement).textContent = fmtMoney2(k.aov);
      ($("evm-conv") as HTMLElement).textContent = (Number(k.conversionRate) || 0).toFixed(2) + "%";
      setDelta("evm-rev-d", k.deltas.revenue); setDelta("evm-ord-d", k.deltas.orders); setDelta("evm-aov-d", k.deltas.aov); setDelta("evm-conv-d", k.deltas.conversionRate);
      const s = await api("revenue-series", { range: currentRange });
      drawSpark("evm-spark-rev", s.map((p: any) => p.revenue), t.accent);
      drawSpark("evm-spark-ord", s.map((p: any) => p.orders), t.accent2);
      drawSpark("evm-spark-aov", s.map((p: any) => (p.orders ? p.revenue / p.orders : 0)), t.green);
      drawSpark("evm-spark-conv", s.map((p: any) => p.orders), t.amber);
    }

    async function renderRevenueChart() {
      const t = theme(); const ctx = $("evm-revchart") as HTMLCanvasElement | null; if (!ctx) return;
      const s = await api("revenue-series", { range: currentRange });
      if (charts.rev) charts.rev.destroy();
      charts.rev = new (Chart())(ctx, {
        data: { labels: s.map((p: any) => p.t), datasets: [
          { type: "bar", label: "Suscripciones", data: s.map((p: any) => p.orders), yAxisID: "y1", backgroundColor: t.accent2 + "55", borderRadius: 4, maxBarThickness: 16, order: 2 },
          { type: "line", label: "Ingresos", data: s.map((p: any) => p.revenue), yAxisID: "y", order: 1, borderColor: t.accent, borderWidth: 2.5, tension: 0.35, fill: true, pointRadius: 0, pointHoverRadius: 5, backgroundColor: (c: any) => { const g = c.chart.ctx.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, t.accent + "40"); g.addColorStop(1, t.accent + "00"); return g; } },
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: t.text, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c: any) => (c.dataset.label === "Ingresos" ? "  Ingresos: " + fmtMoney(c.parsed.y) : "  Suscripciones: " + fmtNum(c.parsed.y)) } } },
          scales: { x: { grid: { color: t.grid }, ticks: { color: t.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { position: "left", grid: { color: t.grid }, ticks: { color: t.text, callback: (v: any) => fmtMoney(v) } }, y1: { position: "right", grid: { display: false }, ticks: { color: t.text } } } },
      });
    }

    async function renderFunnel() {
      const box = $("evm-funnel"); if (!box) return;
      const data = await api("funnel", { range: currentRange });
      if (!data.length) { box.innerHTML = '<div class="empty">Sin datos.</div>'; return; }
      const max = data[0].count || 1;
      let worstIdx = -1, worstDrop = -1;
      for (let i = 1; i < data.length; i++) { const drop = data[i - 1].count ? (1 - data[i].count / data[i - 1].count) * 100 : 0; if (drop > worstDrop) { worstDrop = drop; worstIdx = i; } }
      box.innerHTML = data.map((step: any, i: number) => {
        const width = Math.max(8, (step.count / max) * 100);
        const prev = i ? data[i - 1].count : null; const dropPct = prev ? (1 - step.count / prev) * 100 : 0; const rate = ((step.count / max) * 100).toFixed(1);
        const leak = i === worstIdx ? " leak" : "";
        return `<div><div class="funnel-bar-track"><div class="funnel-bar" style="width:${width}%">${fmtNum(step.count)}</div></div><div class="funnel-meta"><span class="stage">${esc(step.stage)}</span>${i ? `<span class="drop${leak}">▼ ${dropPct.toFixed(1)}% caída${i === worstIdx ? " · mayor fuga" : ""}</span>` : `<span class="rate">100% (entrada)</span>`}<span class="rate">${rate}%</span></div></div>`;
      }).join("");
    }

    const followed = new Set<string>();
    async function renderAlmost() {
      const body = $("evm-almost"); if (!body) return;
      const rows = await api("almost-buyers", { range: currentRange });
      if (!rows.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty">Sin checkouts abandonados en este rango 🎉</div></td></tr>`; return; }
      body.innerHTML = rows.map((r: any) => `<tr><td>${r.email ? esc(r.email) : '<span class="muted">Anónimo</span>'}</td><td><span class="pill">${esc(r.plan)} · $${esc(r.value)}/mes</span></td><td class="money">${fmtMoney2(r.value)}</td><td><span class="pill stage">${esc(r.stage)}</span></td><td class="muted mono">${timeAgo(r.lastSeen)}</td><td>${followed.has(r.id) ? `<button class="btn-follow done">✓ Seguimiento</button>` : `<button class="btn-follow" data-id="${esc(r.id)}">Marcar</button>`}</td></tr>`).join("");
      body.querySelectorAll(".btn-follow:not(.done)").forEach((b) => ((b as HTMLElement).onclick = () => { followed.add((b as HTMLElement).dataset.id!); b.classList.add("done"); b.textContent = "✓ Seguimiento"; }));
    }

    async function renderOrders() {
      const body = $("evm-orders"); if (!body) return;
      const rows = await api("recent-subscriptions");
      if (!rows.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty">Aún no hay suscripciones.</div></td></tr>`; return; }
      body.innerHTML = rows.map((r: any) => `<tr><td class="mono muted">${esc(r.id)}</td><td>${esc(r.customer)}</td><td><span class="pill">${esc(r.plan)}</span></td><td class="money">${fmtMoney2(r.value)}</td><td>${esc(r.country)}</td><td class="muted mono">${timeAgo(r.time)}</td></tr>`).join("");
    }

    async function renderLive() {
      const live = await api("live-visitors");
      ($("evm-live-big") as HTMLElement).textContent = fmtNum(live.count);
      ($("evm-live-top") as HTMLElement).textContent = fmtNum(live.count);
      setTag("evm-tag-live", live.source);
      const sb = $("evm-sessions");
      if (sb) sb.innerHTML = (live.sessions || []).map((s: any) => `<tr><td>${esc(s.country)}</td><td class="muted">${esc(s.city)}</td><td class="muted">${esc(s.device)}</td><td class="muted mono">${esc(s.page)}</td><td class="mono">${durStr(s.durationSec)}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty">Sin sesiones activas.</div></td></tr>`;
      const byC: Record<string, number> = {}; (live.sessions || []).forEach((s: any) => (byC[s.country] = (byC[s.country] || 0) + 1));
      const arr = Object.entries(byC).map(([k, v]) => ({ name: k, value: v })).sort((a, b) => b.value - a.value);
      const max = Math.max(1, ...arr.map((a) => a.value));
      const lc = $("evm-live-country");
      if (lc) lc.innerHTML = arr.map((a) => `<div class="country-row"><span>${esc(a.name.split(" ")[0])}</span><div class="country-bar-track"><div class="country-bar" style="width:${(a.value / max) * 100}%"></div></div><span class="mono muted">${a.value}</span></div>`).join("") || '<div class="empty">—</div>';
    }

    function donut(id: string, data: any[], colors: string[], fmt: (v: any) => string) {
      const t = theme(); const ctx = $(id) as HTMLCanvasElement | null; if (!ctx) return;
      if (charts[id]) charts[id].destroy();
      charts[id] = new (Chart())(ctx, {
        type: "doughnut",
        data: { labels: data.map((d) => d.name), datasets: [{ data: data.map((d) => d.value), backgroundColor: data.map((_, i) => colors[i % colors.length]), borderColor: cssVar("--bg-card"), borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "right", labels: { color: t.text, usePointStyle: true, boxWidth: 8, padding: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c: any) => "  " + c.label + ": " + fmt(c.parsed) } } } },
      });
    }
    async function renderDemographics() {
      const t = theme();
      const d = await api("demographics", { range: currentRange });
      const max = Math.max(1, ...d.countries.map((c: any) => c.value));
      const dc = $("evm-demo-country");
      if (dc) dc.innerHTML = d.countries.map((c: any) => `<div class="country-row"><span>${esc(c.name.split(" ")[0])}</span><div style="display:flex;flex-direction:column;gap:3px"><div style="display:flex;justify-content:space-between;font-size:12px"><span class="muted">${esc(c.name.split(" ").slice(1).join(" "))}</span><span class="money">${fmtMoney(c.value)}</span></div><div class="country-bar-track"><div class="country-bar" style="width:${(c.value / max) * 100}%"></div></div></div><span></span></div>`).join("");
      donut("evm-devices", d.devices, [t.accent, t.accent2, t.amber], (v) => fmtNum(v));
      donut("evm-sources", d.sources, [t.accent, t.accent2, t.green, t.amber, t.purple, t.red], (v) => fmtNum(v));
      donut("evm-newret", d.newVsReturning, [t.accent2, t.text], (v) => fmtNum(v));
      setTag("evm-tag-dev", d.source); setTag("evm-tag-src", d.source); setTag("evm-tag-nr", d.source);
    }

    function runRenders(fns: Array<() => Promise<void>>) {
      const ps = fns.map((fn) => Promise.resolve().then(fn).catch((err) => { console.error("[owner-monitor]", err.message); return { __err: err }; }));
      Promise.all(ps).then((rs) => { const err = rs.find((r: any) => r && r.__err); setDataState(err ? "err" : "ok", err ? "Error al cargar" : "Datos reales"); });
    }
    function renderAll() { runRenders([renderKpis, renderRevenueChart, renderFunnel, renderAlmost, renderOrders, renderLive, renderDemographics]); stamp(); }
    function renderLiveTick() { tick++; runRenders([renderLive, renderOrders]); stamp(); }

    (async () => {
      try { await loadChart(); } catch (e: any) { setDataState("err", e.message); return; }
      if (disposed) return;
      document.querySelectorAll(".evm .range-group button").forEach((btn) => ((btn as HTMLElement).onclick = () => {
        document.querySelectorAll(".evm .range-group button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active"); currentRange = (btn as HTMLElement).dataset.range as any; renderAll();
      }));
      renderAll();
      interval = setInterval(renderLiveTick, 10000);
    })();

    return () => { disposed = true; if (interval) clearInterval(interval); Object.values(charts).forEach((c: any) => { try { c.destroy(); } catch {} }); };
  }, []);

  return (
    <div className="evm">
      <style>{CSS}</style>

      <div className="topbar">
        <div className="title">Monitor del dueño <span className="muted">· EliteVault</span></div>
        <div className="spacer" />
        <div className="range-group">
          <button data-range="today">Hoy</button>
          <button data-range="7d" className="active">7d</button>
          <button data-range="30d">30d</button>
          <button data-range="90d">90d</button>
        </div>
        <div className="badge"><span className="live-dot" /> EN VIVO · <span id="evm-live-top">0</span></div>
        <div className="badge"><span className="sdot ok" id="evm-dot" /> <span id="evm-state">Cargando…</span></div>
        <div className="muted refr">Refresh: <span id="evm-refresh">—</span></div>
      </div>

      <div className="notice">ℹ️ <b>Datos reales</b> de Stripe (ingresos, suscripciones, abandonos, países) y Supabase (registros, auditorías). El <b>tráfico</b> (en vivo, dispositivos, fuentes) está en modo demo hasta conectar PostHog server-side — ver README del monitor.</div>

      <div className="sec-title">Resumen del periodo</div>
      <div className="kpi-row">
        <div className="card kpi"><span className="label">Ingresos (Stripe)</span><span className="value" id="evm-rev">—</span><span className="delta" id="evm-rev-d" /><canvas className="spark" id="evm-spark-rev" width={100} height={42} /></div>
        <div className="card kpi"><span className="label">Nuevas suscripciones</span><span className="value" id="evm-ord">—</span><span className="delta" id="evm-ord-d" /><canvas className="spark" id="evm-spark-ord" width={100} height={42} /></div>
        <div className="card kpi"><span className="label">ARPU</span><span className="value" id="evm-aov">—</span><span className="delta" id="evm-aov-d" /><canvas className="spark" id="evm-spark-aov" width={100} height={42} /></div>
        <div className="card kpi"><span className="label">Conversión registro → pago</span><span className="value" id="evm-conv">—</span><span className="delta" id="evm-conv-d" /><canvas className="spark" id="evm-spark-conv" width={100} height={42} /></div>
      </div>

      <div className="row-2">
        <div className="card"><div className="sec-title">Ingresos en el tiempo</div><div className="chart-box"><canvas id="evm-revchart" /></div></div>
        <div className="card"><div className="sec-title">Embudo de conversión <span className="tag">PRIORITARIO</span></div><div className="funnel" id="evm-funnel" /></div>
      </div>

      <div className="card">
        <div className="sec-title">&quot;Casi pagan&quot; — checkouts abandonados <span className="tag">PRIORITARIO</span></div>
        <div className="table-scroll"><table><thead><tr><th>Usuario</th><th>Plan</th><th>Valor/mes</th><th>Etapa</th><th>Visto hace</th><th /></tr></thead><tbody id="evm-almost" /></table></div>
      </div>

      <div className="card">
        <div className="sec-title">Suscripciones recientes</div>
        <div className="table-scroll"><table><thead><tr><th>ID</th><th>Cliente</th><th>Plan</th><th>Valor/mes</th><th>País</th><th>Hace</th></tr></thead><tbody id="evm-orders" /></table></div>
      </div>

      <div className="row-2b">
        <div className="card"><div className="sec-title">Visitantes en tiempo real <span className="tag amber" id="evm-tag-live">demo</span></div><div className="live-counter"><span className="big" id="evm-live-big">0</span><span className="muted">sesiones activas<br />ahora mismo</span></div><div className="country-list" id="evm-live-country" /></div>
        <div className="card"><div className="sec-title">Sesiones activas</div><div className="table-scroll"><table><thead><tr><th>País</th><th>Ciudad</th><th>Dispositivo</th><th>Página</th><th>Duración</th></tr></thead><tbody id="evm-sessions" /></table></div></div>
      </div>

      <div className="sec-title">Demografía y tráfico</div>
      <div className="demo-grid">
        <div className="card"><div className="sec-title">Top países (por ingresos · Stripe)</div><div className="country-list" id="evm-demo-country" /></div>
        <div className="card"><div className="sec-title">Dispositivos <span className="tag amber" id="evm-tag-dev">demo</span></div><div className="chart-box sm"><canvas id="evm-devices" /></div></div>
        <div className="card"><div className="sec-title">Fuentes de tráfico <span className="tag amber" id="evm-tag-src">demo</span></div><div className="chart-box sm"><canvas id="evm-sources" /></div></div>
        <div className="card"><div className="sec-title">Nuevos vs recurrentes <span className="tag amber" id="evm-tag-nr">demo</span></div><div className="chart-box sm"><canvas id="evm-newret" /></div></div>
      </div>
    </div>
  );
}

const CSS = `
.evm { --bg:#0a0e17; --bg-card:#131b2c; --bg-hover:#1a2236; --border:#1f2937; --border-soft:#1a2233; --text:#e6edf6; --text-dim:#8b97ad; --text-faint:#5b6679; --accent:#6366f1; --accent-2:#22d3ee; --green:#34d399; --red:#f87171; --amber:#fbbf24; --purple:#a78bfa; --grid:rgba(255,255,255,0.05);
  background:var(--bg); color:var(--text); padding:20px; min-height:100%; font-size:14px; }
.evm * { box-sizing:border-box; }
.evm .topbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
.evm .title { font-weight:800; font-size:18px; }
.evm .spacer { flex:1; }
.evm .muted { color:var(--text-dim); }
.evm .refr { font-size:12px; color:var(--text-faint); }
.evm .range-group { display:flex; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:3px; }
.evm .range-group button { border:0; background:transparent; color:var(--text-dim); padding:6px 12px; border-radius:7px; cursor:pointer; font-size:13px; font-weight:600; }
.evm .range-group button.active { background:var(--accent); color:#fff; }
.evm .badge { display:flex; align-items:center; gap:8px; background:var(--bg-card); border:1px solid var(--border); padding:6px 12px; border-radius:10px; font-size:13px; font-weight:600; }
.evm .live-dot { width:9px; height:9px; border-radius:50%; background:var(--green); animation:evpulse 1.6s infinite; }
@keyframes evpulse { 0%{box-shadow:0 0 0 0 rgba(52,211,153,.6)} 70%{box-shadow:0 0 0 8px rgba(52,211,153,0)} 100%{box-shadow:0 0 0 0 rgba(52,211,153,0)} }
.evm .sdot { width:9px; height:9px; border-radius:50%; display:inline-block; background:var(--amber); }
.evm .sdot.ok { background:var(--green); } .evm .sdot.err { background:var(--red); }
.evm .notice { border:1px solid var(--border); background:var(--bg-card); border-radius:12px; padding:12px 16px; font-size:13px; color:var(--text-dim); margin-bottom:18px; }
.evm .notice b { color:var(--text); }
.evm .card { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; padding:18px; }
.evm .sec-title { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-dim); margin-bottom:12px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.evm .tag { font-size:10px; background:var(--accent); color:#fff; padding:2px 7px; border-radius:6px; }
.evm .tag.amber { background:var(--amber); color:#1a1a1a; }
.evm .kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:22px; }
.evm .kpi { position:relative; overflow:hidden; display:flex; flex-direction:column; gap:6px; }
.evm .kpi .label { font-size:12px; color:var(--text-dim); font-weight:600; }
.evm .kpi .value { font-size:28px; font-weight:800; }
.evm .delta { font-size:12px; font-weight:700; }
.evm .delta.up { color:var(--green); } .evm .delta.down { color:var(--red); }
.evm .spark { position:absolute; right:0; bottom:0; width:100px; height:42px; opacity:.9; }
.evm .row-2 { display:grid; grid-template-columns:1.6fr 1fr; gap:16px; margin-bottom:22px; }
.evm .row-2b { display:grid; grid-template-columns:1fr 1.4fr; gap:16px; margin:22px 0; }
.evm .demo-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.evm .chart-box { position:relative; height:280px; } .evm .chart-box.sm { height:220px; }
.evm .card + .card { margin-top:22px; }
.evm .funnel { display:flex; flex-direction:column; gap:8px; }
.evm .funnel-bar-track { background:var(--bg-hover); border-radius:8px; overflow:hidden; height:40px; }
.evm .funnel-bar { height:100%; border-radius:8px; background:linear-gradient(90deg,var(--accent),var(--accent-2)); display:flex; align-items:center; padding:0 12px; color:#fff; font-weight:700; white-space:nowrap; min-width:fit-content; }
.evm .funnel-meta { display:flex; justify-content:space-between; gap:8px; font-size:12px; margin:6px 2px 2px; }
.evm .funnel-meta .stage { color:var(--text); font-weight:600; } .evm .funnel-meta .drop { color:var(--red); font-weight:700; } .evm .funnel-meta .drop.leak { background:rgba(248,113,113,.15); padding:1px 8px; border-radius:6px; } .evm .funnel-meta .rate { color:var(--text-dim); }
.evm .table-scroll { overflow-x:auto; }
.evm table { width:100%; border-collapse:collapse; font-size:13px; }
.evm th { text-align:left; padding:9px 12px; color:var(--text-dim); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid var(--border); }
.evm td { padding:11px 12px; border-bottom:1px solid var(--border-soft); }
.evm tbody tr:hover { background:var(--bg-hover); }
.evm .mono { font-variant-numeric:tabular-nums; } .evm .money { font-weight:700; }
.evm .pill { font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; background:var(--bg-hover); color:var(--text-dim); }
.evm .btn-follow { background:transparent; border:1px solid var(--accent); color:var(--accent); padding:4px 10px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; }
.evm .btn-follow.done { border-color:var(--green); color:var(--green); }
.evm .live-counter { display:flex; align-items:baseline; gap:12px; margin-bottom:14px; }
.evm .live-counter .big { font-size:48px; font-weight:800; color:var(--green); line-height:1; }
.evm .country-list { display:flex; flex-direction:column; gap:9px; }
.evm .country-row { display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:10px; font-size:13px; }
.evm .country-bar-track { background:var(--bg-hover); height:8px; border-radius:999px; overflow:hidden; }
.evm .country-bar { height:100%; background:linear-gradient(90deg,var(--accent-2),var(--accent)); border-radius:999px; }
.evm .empty { text-align:center; color:var(--text-faint); padding:26px 12px; font-size:13px; }
@media (max-width:1100px){ .evm .kpi-row{grid-template-columns:repeat(2,1fr)} .evm .row-2,.evm .row-2b,.evm .demo-grid{grid-template-columns:1fr} }
`;
