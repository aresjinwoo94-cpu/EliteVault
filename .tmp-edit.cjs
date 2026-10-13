const { rw } = require("C:/Users/NWUSER~1/AppData/Local/Temp/claude/C--Dev-MK3v2/d87299c2-fc26-4135-9d5b-0d8c72bbe7dd/scratchpad/rw.cjs");
const f = "lib/library/store-check.ts";
rw(f, `function metaContent(html: string, key: string): string {`, `/** Titles/meta arrive HTML-escaped ("Rothy&#39;s | Shoes &amp; Bags"). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html: string, key: string): string {`);
rw(f, `  return (html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? "").trim();`, `  return decodeEntities(html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? "").trim();`);
rw(f, `  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();`, `  return decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();`);
const a = "scripts/library/gate-audit.mts";
rw(a, `const retry = rows.filter((r) => {
  const h = homes.get(r.id)!;
  return !h.ok || h.html.length < 500;
});`, `// Anything the plain fetch could not fully verify gets a second look in a real browser (JS-rendered
// catalogues, bot walls): unreachable OR missing Shopify / catalogue / brand evidence.
const retry = rows.filter((r) => {
  const h = homes.get(r.id)!;
  if (!h.ok || h.html.length < 500) return true;
  const ev = analyzeHome(h, { title: r.title, domain: r.domain_key ?? r.domain, niche: r.niche });
  return !ev.shopify || !ev.productStore || !ev.brandMatch;
});`);
rw(a, `        homes.set(r.id, { ok: (resp?.status() ?? 0) < 400, status: resp?.status() ?? 0, finalUrl: page.url(), html, headers: {}, cartJson });
        via.set(r.id, "browser");`, `        const b: Home = { ok: (resp?.status() ?? 0) < 400, status: resp?.status() ?? 0, finalUrl: page.url(), html, headers: {}, cartJson };
        // keep whichever read gives the BETTER evidence (the browser is not always better)
        const rowKey = { title: r.title, domain: r.domain_key ?? r.domain, niche: r.niche };
        const prev = homes.get(r.id)!;
        const score = (h: Home) => { const e = analyzeHome(h, rowKey); return [e.reachable, e.shopify, e.productStore, e.brandMatch, e.nicheFit].filter(Boolean).length; };
        if (b.ok && (!prev.ok || score(b) >= score(prev))) {
          homes.set(r.id, b);
          via.set(r.id, "browser");
        }`);
