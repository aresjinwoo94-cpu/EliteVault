// Renders an annotated crop of the OWNER'S OWN audit (the store behind docs/blog-data/example-loss-projection.json)
// for the blog: numbered pins from the audit's own annotations over the real capture, store logo blurred.
//
// Usage: node scripts/blog/render-annotated-capture.mjs
//   → public/blog/shopify-store-redesign/annotated-audit.webp  (+ prints the findings for the post)
//
// NOTE on coordinates: the audit's annotation coordinates are pixels of the 1280×900 capture. (The in-app overlay,
// components/analyzer/annotations-overlay.tsx `normalizeCoords`, divides them by the LARGEST value in the array
// instead of the image size, which moves the pins; here they are used as true pixels.)
// Only the owner's own audits may be rendered this way (brief §B4). Read-only DB access (scripts/blog/_supa.mjs).
import fs from "node:fs";
import sharp from "sharp";
import { select } from "./_supa.mjs";

const OUT = "public/blog/shopify-store-redesign/annotated-audit.webp";
const CROP = { left: 0, top: 0, width: 1280, height: 780 };
const OUT_WIDTH = 1000;
const COLOR = { high: "#EF4444", medium: "#FB923C", low: "#22C55E" };

const [sim] = await select("meta_simulations", "select=analysis_id&status=eq.succeeded&aov_usd=eq.35&daily_budget_usd=eq.100&order=created_at.desc&limit=1");
const [a] = await select("analyses", `select=screenshot_url,result&id=eq.${sim.analysis_id}`);
const img = Buffer.from(await (await fetch(a.screenshot_url)).arrayBuffer());
const meta = await sharp(img).metadata();
if (meta.width !== 1280 || meta.height !== 900) throw new Error(`unexpected capture size ${meta.width}x${meta.height}`);

// The audit's own coordinates are approximate model output and, on this capture, do not land on the elements the
// findings name (checked by eye). So each pin is placed on the element its finding describes, in capture pixels
// [left, top, width, height]: 1 countdown timer, 2 hero headline, 3 icon strip, 4 hero image. The caption of the post says so.
const REGIONS = [
  [728, 8, 96, 36, 836], // 5th value: pin x (right of the timer so the digits stay readable)
  [80, 222, 520, 160],
  [64, 629, 551, 92],
  [665, 219, 551, 502],
];
const anns = a.result.annotations;
if (anns.length !== REGIONS.length) throw new Error("annotation count changed: re-check the regions");
const shapes = anns
  .map((n, i) => {
    const c = COLOR[n.severity] ?? "#EF4444";
    const [x, y, w, h, pinX = x] = REGIONS[i];
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-width="3"/>` +
      `<circle cx="${pinX}" cy="${Math.max(y, 26)}" r="22" fill="${c}" stroke="#fff" stroke-width="3"/>` +
      `<text x="${pinX}" y="${Math.max(y, 26) + 8}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#fff">${i + 1}</text>`;
  })
  .join("");
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="900">${shapes}</svg>`);

// blur the store logo (own store, but the post never names it)
const logo = await sharp(img).extract({ left: 0, top: 62, width: 210, height: 90 }).blur(18).toBuffer();
const composed = await sharp(img).composite([{ input: logo, left: 0, top: 62 }, { input: overlay, left: 0, top: 0 }]).png().toBuffer();
const base = await sharp(composed).extract(CROP).resize({ width: OUT_WIDTH }).webp({ quality: 78 }).toBuffer();

fs.mkdirSync("public/blog/shopify-store-redesign", { recursive: true });
fs.writeFileSync(OUT, base);
const m = await sharp(base).metadata();
console.log(`wrote ${OUT}: ${m.width}x${m.height}, ${(base.length / 1024).toFixed(0)} KB`);
anns.forEach((n, i) => console.log(`${i + 1} [${n.severity}] ${n.message} // fix: ${n.fix}`));
