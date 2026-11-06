import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) {
      if (name === "api" || name === "(app)") continue;
      pages(rel, out);
    } else if (name === "page.tsx") out.push(rel);
  }
  return out;
}

test("every public page that declares its own openGraph also declares an image (a page-level openGraph replaces the parent's image)", () => {
  const missing: string[] = [];
  for (const f of pages("app")) {
    const src = read(f);
    if (!/openGraph:/.test(src)) continue;
    if (/opengraph-image/.test(f)) continue;
    // /s/[slug] has its own app/s/[slug]/opengraph-image.tsx; the home page sits in the root segment of app/opengraph-image.tsx
    if (f === "app/s/[slug]/page.tsx" || f === "app/page.tsx") continue;
    if (!/images:\s*OG_IMAGES/.test(src)) missing.push(f);
  }
  assert.deepEqual(missing, []);
});

test("blog posts get an og:image and a twitter:image", () => {
  const src = read("app/blog/[slug]/page.tsx");
  assert.match(src, /images:\s*OG_IMAGES/);
  assert.match(src, /images:\s*TWITTER_IMAGES/);
});

test("the share-card images point at routes that exist", () => {
  const img = read("lib/seo/social-image.ts");
  assert.match(img, /\/opengraph-image/);
  assert.match(img, /\/twitter-image/);
  assert.ok(statSync(join(root, "app/opengraph-image.tsx")).isFile());
  assert.ok(statSync(join(root, "app/twitter-image.tsx")).isFile());
});

test("/pricing has exactly one h1 (the Pricing component is an h2 elsewhere)", () => {
  assert.match(read("app/pricing/page.tsx"), /<Pricing heading="h1"/);
  const comp = read("components/marketing/pricing.tsx");
  assert.match(comp, /heading:\s*Heading\s*=\s*"h2"/);
  assert.doesNotMatch(read("app/page.tsx"), /<Pricing heading=/);
});

test("the internal opt-out utility is noindex and disallowed in robots.txt", () => {
  assert.match(read("app/internal-opt-out/layout.tsx"), /index:\s*false/);
  assert.match(read("app/robots.ts"), /"\/internal-opt-out"/);
});

test("www.<domain> redirects to the apex with a 308 and keeps path + query (middleware)", () => {
  const mw = read("middleware.ts");
  assert.match(mw, /host\.startsWith\("www\."\)/);
  assert.match(mw, /NextResponse\.redirect\(url,\s*308\)/);
  assert.match(mw, /request\.nextUrl\.clone\(\)/);
  // the redirect comes before any session / cookie work
  assert.ok(mw.indexOf('startsWith("www.")') < mw.indexOf("updateSession(request)"));
});

test("HSTS is added only in the container build, never on Vercel", () => {
  const cfg = read("next.config.mjs");
  assert.match(cfg, /Strict-Transport-Security/);
  const i = cfg.indexOf("Strict-Transport-Security");
  assert.ok(cfg.slice(Math.max(0, i - 400), i).includes('NEXT_OUTPUT === "standalone"'));
});

test("sitemap lists every blog post and excludes private areas", () => {
  const sm = read("app/sitemap.ts");
  assert.match(sm, /allPosts\(\)/);
  for (const p of ["/app/", "/audit/", "/api/", "/internal-opt-out", "/sign-in"]) assert.doesNotMatch(sm, new RegExp(`\\\`\\\${baseUrl}${p.replace(/\//g, "\\/")}`));
});
