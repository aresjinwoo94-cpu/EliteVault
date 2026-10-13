/**
 * WP-L2 — plan for the hardened publication gate over EVERY Library row. READ-ONLY: writes only a report
 * and a plan file; nothing in the database changes (the plan is applied by gate-apply.mts, after approval).
 *
 *   npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server \
 *     scripts/library/gate-audit.mts --env <.env.local> --browser --cache <homes.json> --plan <plan.json> \
 *     [--out docs/library-gate-audit-REPORT.md] [--only a.com,b.com --slow] [--refresh]
 *
 * Each home is read with a plain HTTP fetch (what the weekly job can do); anything not fully verified is
 * re-read in a real local Chrome, ONE store at a time (`--browser`); a store whose catalogue is still missing
 * gets a third, SLOW read (waits for the JavaScript, scrolls). Reads are cached in --cache so re-running the
 * analysis does not hit 133 sites again. The browser is closed in `finally` and its own process tree killed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
for (const l of readFileSync(arg("--env", ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const outPath = arg("--out", "docs/library-gate-audit-REPORT.md");
const planPath = arg("--plan", "");
const cachePath = arg("--cache", "");
const useBrowser = argv.includes("--browser");
const slowAll = argv.includes("--slow");
const only = argv.includes("--only") ? new Set(arg("--only", "").split(",").map((s) => s.trim().toLowerCase())) : null;

const { createSupabaseServiceClient } = await import("../../lib/supabase/server");
const SC = await import("../../lib/library/store-check");
const { judgeStore } = await import("../../lib/library/quality");
const { isRealThumbnail } = await import("../../lib/library/thumbnail");
const { signalTier } = await import("../../lib/library/ad-signal");
type Home = import("../../lib/library/store-check").HomeFetch;
type Evidence = import("../../lib/library/store-check").StoreEvidence;

const svc = createSupabaseServiceClient();
const { data, error } = await svc
  .from("winning_sites")
  .select("id, url, domain, domain_key, title, niche, status, review_reason, is_live, thumbnail_url, thumbnail_source, added_by_ai, source, active_ads_count, internal_score, ad_signals, momentum_score, curated_override")
  .order("niche")
  .order("domain");
if (error) throw new Error(error.message);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const rows = (data ?? []) as Row[];
const dom = (r: Row) => String(r.domain_key ?? r.domain);
console.log(`${rows.length} rows`);

// ── cache of home reads ────────────────────────────────────────────────────────────────────
type Read = { home: Home; via: "fetch" | "browser"; slow?: boolean };
const reads = new Map<string, Read>();
if (cachePath && existsSync(cachePath) && !argv.includes("--refresh")) {
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, Read>)) reads.set(k, v);
  console.log(`cache: ${reads.size} reads`);
}
const saveCache = () => cachePath && writeFileSync(cachePath, JSON.stringify(Object.fromEntries(reads)));
const key = (r: Row) => ({ title: r.title as string | null, domain: dom(r), niche: r.niche as string | null });
const ev = (r: Row): Evidence => {
  const x = reads.get(r.id)!;
  return SC.analyzeHome(x.home, key(r), x.via);
};
const quality = (e: Evidence) => [e.reachable, e.shopify, e.productStore, e.brandMatch].filter(Boolean).length;

// ── 1) plain fetch, 3 at a time (only rows without a cached read) ─────────────────────────────
const todo = rows.filter((r) => !reads.has(r.id) && (!only || only.has(dom(r).toLowerCase())));
let next = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (next < todo.length) {
      const r = todo[next++];
      reads.set(r.id, { home: await SC.fetchHome(r.url), via: "fetch" });
    }
  }),
);
saveCache();

// ── 2) real Chrome, one store at a time ───────────────────────────────────────────────────────
async function browserRead(list: { r: Row; slow: boolean }[]) {
  if (!list.length) return;
  console.log(`${list.length} read(s) in local Chrome`);
  const puppeteer = (await import("puppeteer-core")).default;
  const profile = mkdtempSync(join(tmpdir(), "ev-audit-"));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    userDataDir: profile,
    args: ["--no-first-run", "--disable-extensions", "--mute-audio", "--hide-scrollbars", "--lang=en-US"],
  });
  const pid = browser.process()?.pid;
  const kill = async () => {
    await browser.close().catch(() => {});
    try {
      if (pid && execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).includes(String(pid))) execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } catch {
      /* gone */
    }
    rmSync(profile, { recursive: true, force: true });
  };
  process.on("SIGINT", async () => {
    await kill();
    process.exit(130);
  });
  try {
    for (const { r, slow } of list) {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument("window.__name = (f) => f;");
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        const resp = await page.goto(r.url, { waitUntil: "domcontentloaded", timeout: 35_000 });
        await page.waitForNetworkIdle({ idleTime: 1200, timeout: slow ? 15_000 : 6000 }).catch(() => {});
        if (slow) {
          // let a JS-rendered catalogue appear: scroll through the page, then settle
          await page.evaluate("(async()=>{for(let y=0;y<6;y++){window.scrollBy(0,700);await new Promise(r=>setTimeout(r,600));}window.scrollTo(0,0)})()");
          await new Promise((res) => setTimeout(res, 3500));
        }
        const html = (await page.content()).slice(0, 900_000);
        const cartJson = (await page.evaluate("fetch('/cart.js').then(r=>r.ok?r.json():null).then(j=>!!j&&'items' in j).catch(()=>false)")) as boolean;
        const b: Home = { ok: (resp?.status() ?? 0) < 400, status: resp?.status() ?? 0, finalUrl: page.url(), html, headers: {}, cartJson };
        const prev = reads.get(r.id);
        const better = !prev || !prev.home.ok || quality(SC.analyzeHome(b, key(r))) >= quality(SC.analyzeHome(prev.home, key(r), prev.via));
        if (b.ok && better) reads.set(r.id, { home: b, via: "browser", slow });
      } catch (e) {
        console.log(`  ✗ ${dom(r)}: ${(e as Error).message.split("\n")[0].slice(0, 80)}`);
      } finally {
        await page.close().catch(() => {});
      }
      saveCache();
      await new Promise((res) => setTimeout(res, 3000));
    }
  } finally {
    await kill();
  }
}
if (useBrowser) {
  const needs = (r: Row) => {
    const x = reads.get(r.id);
    if (!x) return false;
    if (x.via === "browser") return false;
    const e = ev(r);
    return !e.reachable || !e.shopify || !e.productStore || !e.brandMatch;
  };
  await browserRead(rows.filter((r) => (only ? only.has(dom(r).toLowerCase()) : needs(r))).map((r) => ({ r, slow: slowAll })));
  // third read: reachable but no catalogue yet → wait for the JavaScript
  const slowNeeded = rows.filter((r) => {
    const x = reads.get(r.id);
    return x && !x.slow && (only ? only.has(dom(r).toLowerCase()) && !slowAll : ev(r).reachable && !ev(r).productStore);
  });
  await browserRead(slowNeeded.map((r) => ({ r, slow: true })));
}

// ── 3) per-row verdict + plan ─────────────────────────────────────────────────────────────────
type Plan = {
  id: string;
  domain: string;
  title: string;
  from: { status: string; niche: string; reason: string | null };
  to: { status: string; niche: string; reason: string | null };
  action: "stay_published" | "demote" | "reassign_niche" | "would_publish" | "held_passes" | "held_fails" | "stay_review" | "reassign_and_demote";
  fails: string[];
  shopify: boolean;
  tier: string;
  evidence: Evidence;
};
/** Stable machine codes for winning_sites.review_reason. */
function reasonCode(f: string | undefined): string | null {
  if (!f) return null;
  if (/real image/.test(f)) return "no_image";
  if (/not live/.test(f)) return "not_live";
  if (/unreachable/.test(f)) return "unreachable";
  if (/match the brand/.test(f)) return "wrong_domain";
  if (/catalogue/.test(f)) return "no_catalogue";
  if (/app \/ service/.test(f)) return "not_a_store";
  if (/fit the niche/.test(f)) return "niche_mismatch";
  if (/not verified yet/.test(f)) return "unverified";
  return f.slice(0, 60);
}
const plans: Plan[] = rows.map((r) => {
  const x = reads.get(r.id);
  let e = ev(r);
  let niche = r.niche as string;
  // Niche that doesn't fit → try to re-assign to the niche the home actually belongs to.
  if (e.reachable && !e.nicheFit && x) {
    const sug = SC.suggestNiche(x.home.html);
    if (sug && sug.niche !== niche) {
      niche = sug.niche;
      e = SC.analyzeHome(x.home, { ...key(r), niche }, x.via);
    }
  }
  const verdict = judgeStore({
    url: r.url,
    domain: dom(r),
    title: r.title,
    niche,
    // the stored probe runs from Vercel and is wrong for bot-walled stores: a successful read counts as alive
    isLive: !!r.is_live || e.reachable,
    thumbnailUrl: r.thumbnail_url,
    evidence: e,
    ownerCurated: r.curated_override === true,
  });
  const fails = [...verdict.reasons];
  const held = r.review_reason === "image_pending_review";
  const blocked = r.review_reason === "wrong_domain" || r.review_reason === "not_a_store";
  if (blocked && !fails.length) fails.push(`parked by the owner (${r.review_reason})`);
  const passes = fails.length === 0;
  const reassigned = niche !== r.niche;
  let action: Plan["action"];
  let status = r.status as string;
  if (r.status === "published") {
    if (passes) action = reassigned ? "reassign_niche" : "stay_published";
    else {
      action = reassigned ? "reassign_and_demote" : "demote";
      status = "review";
    }
  } else if (held) action = passes ? "held_passes" : "held_fails";
  else if (passes && !blocked) {
    action = "would_publish";
    status = "published";
  } else action = "stay_review";
  const reason = status === "published" ? null : held ? "image_pending_review" : (blocked ? r.review_reason : reasonCode(fails[0]) ?? r.review_reason ?? null);
  return {
    id: r.id,
    domain: dom(r),
    title: String(r.title).replace(/\s+/g, " ").slice(0, 40),
    from: { status: r.status, niche: r.niche, reason: r.review_reason },
    to: { status, niche, reason },
    action,
    fails,
    shopify: e.shopify,
    tier: signalTier(r as never),
    evidence: e,
  };
});
if (planPath) writeFileSync(planPath, JSON.stringify(plans, null, 2));

// ── 4) report ───────────────────────────────────────────────────────────────────────────────────
const by = (a: Plan["action"]) => plans.filter((p) => p.action === a);
const line = (p: Plan) => `| ${p.domain} | ${p.from.niche}${p.to.niche !== p.from.niche ? ` → **${p.to.niche}**` : ""} | ${p.fails.join("; ").replace(/\|/g, "/") || "—"} | ${p.shopify ? "✅" : "⚠️"} |`;
const md: string[] = [];
md.push(`# Library — plan del filtro endurecido (WP-L2)\n\nGenerado: ${new Date().toISOString()} · **solo lectura**: nada se ha aplicado · \`scripts/library/gate-audit.mts\`\n`);
md.push(`Bloquean: sitio vivo · imagen real · alcanzable · dominio = marca · catálogo de productos · no es app/servicio · el contenido encaja con el nicho (se reasigna si encaja en otro). **No bloquea:** Shopify no verificado (aviso/insignia) ni la señal de anuncios (solo ordena).\n`);
md.push(`## Resumen\n\n| Acción | Filas |\n|---|---|`);
for (const [a, l] of [["stay_published", "Se quedan publicadas"], ["reassign_niche", "Se quedan publicadas y **cambian de nicho**"], ["demote", "**Salen** (publicada → review)"], ["reassign_and_demote", "Salen y cambian de nicho"], ["would_publish", "Entrarían (hoy en review, pasan el filtro)"], ["held_passes", "Retenidas (esperan tu OK): pasan"], ["held_fails", "Retenidas: no pasan"], ["stay_review", "Siguen en review"]] as [Plan["action"], string][])
  md.push(`| ${l} | ${by(a).length} |`);
const pubAfter = plans.filter((p) => p.to.status === "published");
md.push(`\n**Publicadas hoy:** ${plans.filter((p) => p.from.status === "published").length} → **después:** ${pubAfter.length}\n`);
const nicheCount = new Map<string, number>();
for (const p of pubAfter) nicheCount.set(p.to.niche, (nicheCount.get(p.to.niche) ?? 0) + 1);
md.push(`### Publicadas por nicho después (una página /winning-shopify-stores/<nicho> existe con ≥ 3)\n\n| Nicho | Publicadas |\n|---|---|`);
for (const [n, c] of [...nicheCount].sort((a, b) => b[1] - a[1])) md.push(`| ${n} | ${c}${c >= 3 ? "" : " (no califica aún)"} |`);
const section = (title: string, list: Plan[]) => {
  if (!list.length) return;
  md.push(`\n## ${title} (${list.length})\n\n| Dominio | Nicho | Motivo | Shopify |\n|---|---|---|---|`);
  for (const p of list) md.push(line(p));
};
section("Salen: publicada → review", [...by("demote"), ...by("reassign_and_demote")]);
section("Cambian de nicho (siguen publicadas)", by("reassign_niche"));
section("Entrarían a publicadas", by("would_publish"));
section("Retenidas que PASAN (no se publican hasta tu OK)", by("held_passes"));
section("Retenidas que NO pasan", by("held_fails"));
const sinShopify = plans.filter((p) => p.to.status === "published" && !p.shopify);
md.push(`\n## Aviso: publicadas sin Shopify verificado (${sinShopify.length}) — sin insignia, no bloquean\n\n${sinShopify.map((p) => p.domain).join(", ") || "—"}`);
md.push(`\n## Señal de las publicadas después\n\n| Señal | Filas |\n|---|---|\n${["measured", "curated", "none"].map((t) => `| ${t} | ${pubAfter.filter((p) => p.tier === t).length} |`).join("\n")}`);
const rest = by("stay_review");
const rc = new Map<string, number>();
for (const p of rest) for (const f of p.fails.length ? p.fails : ["(sin motivo nuevo)"]) { const k = f.replace(/\(.*\)$/, "").trim(); rc.set(k, (rc.get(k) ?? 0) + 1); }
md.push(`\n## Siguen en review (${rest.length}) — motivos\n\n| Motivo | Filas |\n|---|---|\n${[...rc].sort((a, b) => b[1] - a[1]).map(([k, c]) => `| ${k} | ${c} |`).join("\n")}`);
writeFileSync(outPath, md.join("\n") + "\n");
console.log(`published ${plans.filter((p) => p.from.status === "published").length} → ${pubAfter.length} · demote ${by("demote").length + by("reassign_and_demote").length} · would publish ${by("would_publish").length} · held pass ${by("held_passes").length}/${by("held_passes").length + by("held_fails").length} · reassign ${plans.filter((p) => p.to.niche !== p.from.niche).length} → ${outPath}`);
