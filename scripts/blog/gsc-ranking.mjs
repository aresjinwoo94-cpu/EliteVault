// A4 — blog ranking from the owner's Search Console export (Performance → Pages / Queries, last 3 months).
//
// Usage: node scripts/blog/gsc-ranking.mjs [dir]   (default docs/blog-data/gsc-2026-10-22)
// Reads pages.csv, queries.csv, devices.csv, countries.csv (renamed from the Spanish export names) and writes
// docs/blog-data/a4-search-console.json. Pure aggregation of public Search Console data of our own site: no PII.
import fs from "node:fs";

const dir = process.argv[2] ?? "docs/blog-data/gsc-2026-10-22";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const num = (s) => Number(String(s ?? "0").replace("%", "").replace(",", "."));
const read = (f) => parseCsv(fs.readFileSync(`${dir}/${f}`, "utf8"));

const pages = read("pages.csv").map((r) => ({ url: r["Páginas principales"], clicks: num(r["Clics"]), impressions: num(r["Impresiones"]), ctr: num(r["CTR"]), position: num(r["Posición"]) }));
const queries = read("queries.csv").map((r) => ({ query: r["Consultas principales"], clicks: num(r["Clics"]), impressions: num(r["Impresiones"]), ctr: num(r["CTR"]), position: num(r["Posición"]) }));
const devices = read("devices.csv");
const countries = read("countries.csv");

// brand queries: the product name and its many misspellings
const BRAND = /elit|ellte|élite|vault|vrult|valut|valt\b|vaul|voult|vaut|vailt|vult|bault|varult|vualt/i;
const brand = queries.filter((q) => BRAND.test(q.query));
const nonBrand = queries.filter((q) => !BRAND.test(q.query));
const sum = (a, k) => a.reduce((x, r) => x + r[k], 0);

const blog = pages
  .filter((p) => /^https:\/\/elitevaultapp\.com\/blog\/[^/#?]+$/.test(p.url))
  .map((p) => ({ slug: p.url.split("/blog/")[1], clicks: p.clicks, impressions: p.impressions, position: p.position }))
  .sort((a, b) => b.impressions - a.impressions);

const totalClicks = sum(devices.map((d) => ({ c: num(d["Clics"]) })), "c");
const out = {
  source: "Search Console export, Performance on Search, last 3 months, exported 2026-10-22 (web search)",
  site_clicks: totalClicks,
  site_impressions: sum(devices.map((d) => ({ c: num(d["Impresiones"]) })), "c"),
  brand_queries: { clicks: sum(brand, "clicks"), clicks_share_pct: Math.round((sum(brand, "clicks") / totalClicks) * 1000) / 10, note: "the product name and misspellings; countries: " + countries.slice(0, 4).map((c) => `${c["País"]} ${c["Clics"]}`).join(", ") },
  blog: {
    clicks: sum(blog, "clicks"),
    impressions: sum(blog, "impressions"),
    clicks_share_pct: Math.round((sum(blog, "clicks") / totalClicks) * 10000) / 100,
    posts_with_impressions: blog.length,
    posts: blog,
  },
  top_pages_non_blog: pages.filter((p) => !p.url.includes("/blog")).slice(0, 8),
  non_brand_queries_top: nonBrand.slice(0, 30),
  non_brand_queries_with_clicks: nonBrand.filter((q) => q.clicks > 0),
};
fs.writeFileSync("docs/blog-data/a4-search-console.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ site_clicks: out.site_clicks, brand: out.brand_queries, blog: { clicks: out.blog.clicks, impressions: out.blog.impressions, share: out.blog.clicks_share_pct, n: blog.length } }, null, 2));
console.log(blog.map((b) => `${b.impressions}\t${b.clicks}\t${b.position}\t${b.slug}`).join("\n"));
