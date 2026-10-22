// A4 — blog traffic ranking from EliteVault's first-party analytics (public.page_views, last 90 days).
//
// PostHog, Vercel Analytics and Search Console are NOT reachable from this machine, so this is the best
// available source — and it is thin (see "n" in the output). It must be read as PROVISIONAL and replaced by
// the owner's Search Console export (Performance → Pages) before Phase C picks the posts to rewrite.
//
// Usage: node scripts/blog/traffic-ranking.mjs   → docs/blog-data/a4-traffic-ranking.json
// Read-only. Output has no visitor-level data: only per-path counts.
import fs from "node:fs";
import { select } from "./_supa.mjs";

const DAYS = 90;
const since = new Date(Date.now() - DAYS * 864e5).toISOString();
const slugs = [...fs.readFileSync("lib/blog/posts.ts", "utf8").matchAll(/^\s{4}slug: "([^"]+)",/gm)].map((m) => m[1]);

const rows = await select(
  "page_views",
  `select=path,anon_id,created_at&path=like./blog*&created_at=gte.${since}&order=created_at.asc`,
  { pageSize: 1000, max: 100000 },
);

const by = new Map();
for (const r of rows) {
  const p = (r.path ?? "").split("?")[0].replace(/\/$/, "");
  const e = by.get(p) ?? { views: 0, visitors: new Set() };
  e.views++;
  e.visitors.add(r.anon_id);
  by.set(p, e);
}

const posts = slugs
  .map((slug) => {
    const e = by.get(`/blog/${slug}`);
    return { slug, unique_visitors: e?.visitors.size ?? 0, views: e?.views ?? 0 };
  })
  .sort((a, b) => b.unique_visitors - a.unique_visitors || b.views - a.views);

const index = by.get("/blog");
const out = {
  source: "first-party page_views (public.page_views). Not PostHog / Vercel / Search Console (inaccessible).",
  window_days: DAYS,
  from: rows[0]?.created_at?.slice(0, 10) ?? null,
  to: rows.at(-1)?.created_at?.slice(0, 10) ?? null,
  total_blog_rows: rows.length,
  blog_index: index ? { unique_visitors: index.visitors.size, views: index.views } : null,
  caveats: [
    "Very small sample: the busiest post has ~a dozen unique visitors in 90 days. Differences between posts are not statistically meaningful.",
    "A high views/visitors ratio (many views from few visitors) usually means repeat visits or testing, not reach: rank by unique_visitors.",
    "Impressions and clicks from Google are not in this data; they decide which posts rank, so this is not a substitute for Search Console.",
  ],
  posts,
};
fs.writeFileSync("docs/blog-data/a4-traffic-ranking.json", JSON.stringify(out, null, 2) + "\n");
console.log(posts.map((p) => `${p.unique_visitors}\t${p.views}\t${p.slug}`).join("\n"));
console.log("rows:", rows.length, out.from, out.to);
