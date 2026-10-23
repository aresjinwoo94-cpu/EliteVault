/**
 * Mechanical half of the elitevault-blog-writer QA checklist (.claude/skills/elitevault-blog-writer/references/qa-checklist.md).
 *
 * Usage (repo root):
 *   npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server scripts/blog/qa-check.mts <slug>[:T1|T2|T3] [...] [--new]
 *   --new   also require keyword == slug (hyphenated), in the title start, in the h1 and in the first sentence
 *
 * Prints a markdown table of ✓/✗ per post. Exit code 1 if any ✗. The checks a script cannot do (value test,
 * plan claims vs code, source of each figure, anonymized screenshots) are listed as "manual" and must be
 * ticked by the reviewer in the PR.
 */
import { allPosts, type BlogPost } from "../../lib/blog/posts";
import { CTA_CLASS, EV_OPEN, EV_CLOSE } from "../../lib/blog/post-helpers";

const TIER_RANGE = { T1: [1500, 2200], T2: [1200, 1800], T3: [900, 1300] } as const;
const ALLOWED_70_22 = new Set(["abandoned-cart-recovery", "why-customers-abandon-cart-2026"]);
const FINAL_VIDEO_ID = "43CfVNIds7Q";

const words = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
/** Plain text of an HTML fragment: SVG dropped, tags removed without splitting words, entities decoded, spaces collapsed. */
const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");
const norm = (s: string) => s.trim().toLowerCase();

type Row = { check: string; ok: boolean; detail: string };

function checkPost(p: BlogPost, tier: keyof typeof TIER_RANGE | undefined, isNew: boolean): Row[] {
  const rows: Row[] = [];
  const add = (check: string, ok: boolean, detail = "") => rows.push({ check, ok, detail });
  const html = p.bodyHtml;
  const plain = text(html);
  const total = words(html);
  const slugs = new Set(allPosts().map((x) => x.slug));

  // keyword / structure
  const lede = html.match(/<p class="lede">([\s\S]*?)<\/p>/)?.[1] ?? "";
  const firstSentence = text(lede).trim().split(/(?<=[.?!:])\s/)[0] ?? "";
  add("lede present", lede.length > 0);
  add("keyword in first sentence of lede", norm(firstSentence).includes(norm(p.keyword)), firstSentence.slice(0, 80));
  if (isNew) {
    add("slug = keyword", p.slug === norm(p.keyword).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), p.slug);
    add("title starts with keyword", norm(p.title).startsWith(norm(p.keyword)), p.title);
    add("h1 contains keyword", norm(p.h1).includes(norm(p.keyword)), p.h1);
  }
  add("author = Ariel Jiménez", p.author === "Ariel Jiménez");
  add("updated set", !!p.updated, p.updated ?? "");
  add("5 FAQs", (p.faqs?.length ?? 0) === 5, String(p.faqs?.length ?? 0));

  // video
  add("final video embedded + VideoObject", html.includes(FINAL_VIDEO_ID) && p.video?.id === FINAL_VIDEO_ID);

  // length
  if (tier) {
    const [lo, hi] = TIER_RANGE[tier];
    add(`words in ${tier} range ${lo}–${hi}`, total >= lo && total <= hi, String(total));
  } else add("word count (no tier given)", true, String(total));

  // CTAs
  const ctas = [...html.matchAll(new RegExp(`<p class="${CTA_CLASS}">([\\s\\S]*?)</p>`, "g"))];
  const positions = ctas.map((m) => m[1].match(/utm_content=(\w+)/)?.[1]);
  add("3 CTAs: early, showcase, end", ["early", "showcase", "end"].every((x) => positions.includes(x)), positions.join(","));
  add("CTA UTMs correct", ctas.length > 0 && ctas.every((m) => m[1].includes("utm_source=blog") && m[1].includes("utm_medium=inline") && m[1].includes(`utm_campaign=${p.slug}`)));
  const earlyIdx = html.search(/utm_content=early/);
  const bodyNoSvgLen = html.replace(/<svg[\s\S]*?<\/svg>/g, "").length;
  const earlyPos = earlyIdx >= 0 ? html.slice(0, earlyIdx).replace(/<svg[\s\S]*?<\/svg>/g, "").length / bodyNoSvgLen : 1;
  add("early CTA before first third", earlyPos < 1 / 3, `${Math.round(earlyPos * 100)}%`);
  add("no 'free' in h1 / CTA text", !/\bfree\b/i.test(p.h1) && ctas.every((m) => !/\bfree\b/i.test(text(m[1]))), "");

  // evidence + product share
  // Blocks are delimited by the comment markers evidenceBlock() writes, so a nested <figure> (an SVG replica)
  // inside a block cannot cut it short.
  const evs: string[][] = [];
  for (let i = html.indexOf(EV_OPEN); i >= 0; i = html.indexOf(EV_OPEN, i + 1)) {
    const end = html.indexOf(EV_CLOSE, i);
    if (end < 0) break;
    evs.push([html.slice(i, end + EV_CLOSE.length)]);
  }
  add("≥1 'EliteVault in action' block (ideal 2)", evs.length >= 1, String(evs.length));
  const productWords = evs.reduce((a, m) => a + words(m[0]), 0) + ctas.reduce((a, m) => a + words(m[1]), 0);
  add("product share ≤ 30% of body", total > 0 && evs.length > 0 && productWords / total <= 0.3, `${Math.round((productWords / total) * 100)}% (${productWords}/${total} words, blocks + CTAs)`);
  add("every in-action block states its plan", evs.length > 0 && evs.every((m) => /Available on:/.test(m[0])));
  const showcaseIdx = html.search(/utm_content=showcase/);
  const firstEvEnd = evs.length ? html.indexOf(EV_CLOSE) : -1;
  add("showcase CTA comes after the first in-action block", firstEvEnd >= 0 && showcaseIdx > firstEvEnd);
  add("first EliteVault mention carries '(ours — full disclosure)'", /ours — full disclosure/.test(plain));

  // visuals
  const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
  add("≥2 SVG diagrams", svgs.length >= 2, String(svgs.length));
  add("SVGs accessible (role=img, title, desc)", svgs.every((s) => /role="img"/.test(s) && /<title/.test(s) && /<desc/.test(s)));
  add("SVGs < 8 KB, no gold, font-size ≥ 14", svgs.every((s) => s.length < 8000 && !/#d4af37|champagne|gold/i.test(s) && [...s.matchAll(/font-size="([\d.]+)"/g)].every((m) => Number(m[1]) >= 14)));
  const imgs = html.match(/<img[^>]*>/g) ?? [];
  add("images have alt, width, height, loading=lazy", imgs.every((i) => /alt="[^"]+"/.test(i) && /width=/.test(i) && /height=/.test(i) && /loading="lazy"/.test(i)), `${imgs.length} images`);

  // sources & links
  const ext = [...html.matchAll(/<a href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  add("external sources linked", ext.length >= 3, `${ext.length} links`);
  const everywhere = [html, p.title, p.h1, p.description, p.excerpt, ...(p.faqs ?? []).flatMap((f) => [f.q, f.a])].join(" ");
  add("70.22 only in the two cart posts (body, title, description, FAQ)", !everywhere.includes("70.22") || ALLOWED_70_22.has(p.slug));
  const internal = [...html.matchAll(/href="(\/blog\/[^"#?]*)/g)].map((m) => m[1].slice(6));
  add("internal /blog/ links exist", internal.every((s) => slugs.has(s)), internal.filter((s) => !slugs.has(s)).join(","));
  const anchors = [...html.matchAll(/<a href="[^"]+"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]).filter((a) => !a.includes("→"));
  add("no duplicate anchor text", new Set(anchors).size === anchors.length, anchors.filter((a, i) => anchors.indexOf(a) !== i).join(" | "));
  add("links to / as 'Shopify store audit'", /<a href="\/">Shopify store audit<\/a>/.test(html));
  return rows;
}

const args = process.argv.slice(2);
const isNew = args.includes("--new");
const targets = args.filter((a) => !a.startsWith("--"));
if (!targets.length) {
  console.error("usage: qa-check.mts <slug>[:T1|T2|T3] ... [--new]");
  process.exit(2);
}
let failed = 0;
for (const t of targets) {
  const [slug, tier] = t.split(":") as [string, keyof typeof TIER_RANGE | undefined];
  const p = allPosts().find((x) => x.slug === slug);
  if (!p) {
    console.log(`\n## ${slug}\n✗ post not found`);
    failed++;
    continue;
  }
  const rows = checkPost(p, tier, isNew);
  console.log(`\n## ${slug}${tier ? ` (${tier})` : ""}\n\n| | Check | Detail |\n|---|---|---|`);
  for (const r of rows) {
    if (!r.ok) failed++;
    console.log(`| ${r.ok ? "✓" : "✗"} | ${r.check} | ${r.detail} |`);
  }
  console.log("\nManual (reviewer ticks in the PR): value test without product blocks · every plan mention matches code gating · every own figure has its docs/blog-data query with n ≥ 30 · every external figure opened at its source · screenshots show no third-party identity · visual check at 360px and 1280px · JSON-LD BlogPosting + FAQPage + VideoObject.");
}
process.exit(failed ? 1 : 0);
