/**
 * WP-L2 — audit of EVERY Library row against the hardened publication gate. READ-ONLY: writes only a
 * report file, never the database (use --apply later, after the owner has seen the summary).
 *
 *   npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server \
 *     scripts/library/gate-audit.mts --env <.env.local> [--out docs/library-gate-audit-REPORT.md] [--json <file>] [--browser]
 *
 * Each home is read with a plain HTTP fetch (what the weekly job can do); stores that answer 403 /
 * connection errors are retried in a real local Chrome (--browser), ONE at a time. The evidence is
 * the same `StoreEvidence` the job stores in `winning_sites.store_checks`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
for (const l of readFileSync(arg("--env", ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const outPath = arg("--out", "docs/library-gate-audit-REPORT.md");
const jsonPath = arg("--json", "");
const useBrowser = argv.includes("--browser");

const { createSupabaseServiceClient } = await import("../../lib/supabase/server");
const { fetchHome, analyzeHome, evidenceFailures } = await import("../../lib/library/store-check");
const { isRealThumbnail } = await import("../../lib/library/thumbnail");
type Evidence = import("../../lib/library/store-check").StoreEvidence;
type Home = import("../../lib/library/store-check").HomeFetch;

const svc = createSupabaseServiceClient();
const { data, error } = await svc
  .from("winning_sites")
  .select("id, url, domain, domain_key, title, niche, status, review_reason, is_live, thumbnail_url, thumbnail_source, added_by_ai, source, active_ads_count, internal_score, ad_signals, momentum_score")
  .order("niche")
  .order("domain");
if (error) throw new Error(error.message);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const rows = (data ?? []) as Row[];
console.log(`${rows.length} rows`);

// ── 1) plain fetch, 3 at a time ──────────────────────────────────────────────────────────
const homes = new Map<string, Home>();
let next = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (next < rows.length) {
      const r = rows[next++];
      homes.set(r.id, await fetchHome(r.url));
    }
  }),
);

// ── 2) bot-walled / unreachable → real Chrome, one at a time ──────────────────────────────
const via = new Map<string, "fetch" | "browser">();
// Anything the plain fetch could not fully verify gets a second look in a real browser (JS-rendered
// catalogues, bot walls): unreachable OR missing Shopify / catalogue / brand evidence.
const retry = rows.filter((r) => {
  const h = homes.get(r.id)!;
  if (!h.ok || h.html.length < 500) return true;
  const ev = analyzeHome(h, { title: r.title, domain: r.domain_key ?? r.domain, niche: r.niche });
  return !ev.shopify || !ev.productStore || !ev.brandMatch;
});
if (useBrowser && retry.length) {
  console.log(`${retry.length} unreachable by plain fetch → local Chrome`);
  const puppeteer = (await import("puppeteer-core")).default;
  const profile = mkdtempSync(join(tmpdir(), "ev-audit-"));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    userDataDir: profile,
    args: ["--no-first-run", "--disable-extensions", "--mute-audio", "--hide-scrollbars", "--lang=en-US"],
  });
  const pid = browser.process()?.pid;
  try {
    for (const r of retry) {
      const page = await browser.newPage();
      try {
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        const resp = await page.goto(r.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 6000 }).catch(() => {});
        const html = (await page.content()).slice(0, 600_000);
        const cartJson = await page.evaluate("fetch('/cart.js').then(r=>r.ok?r.json():null).then(j=>!!j&&'items' in j).catch(()=>false)") as boolean;
        const b: Home = { ok: (resp?.status() ?? 0) < 400, status: resp?.status() ?? 0, finalUrl: page.url(), html, headers: {}, cartJson };
        // keep whichever read gives the BETTER evidence (the browser is not always better)
        const rowKey = { title: r.title, domain: r.domain_key ?? r.domain, niche: r.niche };
        const prev = homes.get(r.id)!;
        const score = (h: Home) => {
          const e = analyzeHome(h, rowKey);
          return [e.reachable, e.shopify, e.productStore, e.brandMatch, e.nicheFit].filter(Boolean).length;
        };
        if (b.ok && (!prev.ok || score(b) >= score(prev))) {
          homes.set(r.id, b);
          via.set(r.id, "browser");
        }
      } catch (e) {
        homes.set(r.id, { ok: false, status: 0, finalUrl: r.url, html: "", headers: {}, error: (e as Error).message.split("\n")[0] });
      } finally {
        await page.close().catch(() => {});
      }
      await new Promise((res) => setTimeout(res, 3000));
    }
  } finally {
    await browser.close().catch(() => {});
    if (pid) {
      try {
        if (execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).includes(String(pid))) execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
      } catch {
        /* gone */
      }
    }
    rmSync(profile, { recursive: true, force: true });
  }
}

// ── 3) verdict per row ─────────────────────────────────────────────────────────────────────
type Out = { id: string; domain: string; title: string; niche: string; status: string; image: string; ads: string; evidence: Evidence; fails: string[]; verifiable: boolean };
const out: Out[] = rows.map((r) => {
  const ev = analyzeHome(homes.get(r.id)!, { title: r.title, domain: r.domain_key ?? r.domain, niche: r.niche }, via.get(r.id) ?? "fetch");
  const fails = evidenceFailures(ev);
  if (!isRealThumbnail(r.thumbnail_url)) fails.push("no real image");
  if (!r.is_live) fails.push("site not live (last probe)");
  const measured = r.ad_signals?.source === "meta_ad_library" && r.ad_signals?.estimated !== true;
  const ads = measured ? "measured" : r.active_ads_count > 0 ? (r.ad_signals?.estimated || r.source === "discovery_agent" ? "estimated" : "unlabelled") : "none";
  const image = r.thumbnail_source ?? (isRealThumbnail(r.thumbnail_url) ? "owner?" : "none");
  return { id: r.id, domain: r.domain_key ?? r.domain, title: String(r.title).replace(/\s+/g, " ").slice(0, 40), niche: r.niche, status: r.status, image, ads, evidence: ev, fails, verifiable: fails.length === 0 };
});

if (jsonPath) writeFileSync(jsonPath, JSON.stringify(out, null, 2));

const cnt = (f: (o: Out) => boolean) => out.filter(f).length;
const md: string[] = [];
md.push(`# Library — auditoría con el filtro endurecido (WP-L2)\n\nGenerado: ${new Date().toISOString()} · **solo lectura** (no se cambió ninguna fila) · \`scripts/library/gate-audit.mts\`\n`);
md.push(`Criterios *verificables* (evidencia de la home): Shopify · dominio = marca · catálogo de productos · no es app/servicio · el contenido encaja con el nicho · imagen real · sitio vivo.\n`);
md.push(`## Resumen\n\n| | Filas |\n|---|---|\n| Total | ${out.length} |\n| **Pasan todos los criterios verificables** | ${cnt((o) => o.verifiable)} |\n| No pasan | ${cnt((o) => !o.verifiable)} |`);
md.push(`\n### Por estado actual\n\n| Estado actual | Total | Pasan | No pasan |\n|---|---|---|---|`);
for (const s of ["published", "review", "draft"]) md.push(`| ${s} | ${cnt((o) => o.status === s)} | ${cnt((o) => o.status === s && o.verifiable)} | ${cnt((o) => o.status === s && !o.verifiable)} |`);
md.push(`\n### Motivos de rechazo (una fila puede tener varios)\n\n| Motivo | Filas | De ellas publicadas hoy |\n|---|---|---|`);
const reasonCount = new Map<string, { n: number; pub: number }>();
for (const o of out) for (const f of o.fails) {
  const k = f.replace(/\(.*\)$/, "").trim();
  const c = reasonCount.get(k) ?? { n: 0, pub: 0 };
  c.n++;
  if (o.status === "published") c.pub++;
  reasonCount.set(k, c);
}
for (const [k, c] of [...reasonCount].sort((a, b) => b[1].n - a[1].n)) md.push(`| ${k} | ${c.n} | ${c.pub} |`);
md.push(`\n### Señal de "ganadora" (anuncios) entre las que pasan lo verificable\n\n| Anuncios | Filas | Publicadas hoy |\n|---|---|---|`);
for (const a of ["measured", "estimated", "unlabelled", "none"]) md.push(`| ${a} | ${cnt((o) => o.verifiable && o.ads === a)} | ${cnt((o) => o.verifiable && o.ads === a && o.status === "published")} |`);
md.push(`\n## Detalle por tienda\n\n| Estado hoy | Nicho | Dominio | Imagen | Anuncios | Pasa | Motivos |\n|---|---|---|---|---|---|---|`);
for (const o of out.sort((a, b) => Number(a.verifiable) - Number(b.verifiable) || a.status.localeCompare(b.status) || a.niche.localeCompare(b.niche)))
  md.push(`| ${o.status} | ${o.niche} | ${o.domain} | ${o.image} | ${o.ads} | ${o.verifiable ? "✅" : "❌"} | ${o.fails.join("; ").replace(/\|/g, "/")} |`);
writeFileSync(outPath, md.join("\n") + "\n");
console.log(`pass=${cnt((o) => o.verifiable)} fail=${cnt((o) => !o.verifiable)} → ${outPath}`);
