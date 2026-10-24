// A3 — lists the videos of the Elitevaultapp channel (title, id, upload date, description, length).
// Reads public YouTube watch pages; no API key. Output: docs/blog-youtube-videos.json
// Usage: node scripts/blog/youtube-inventory.mjs
import fs from "node:fs";

const HANDLE = "shopify-store-audit"; // https://www.youtube.com/@shopify-store-audit
const UA = { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" };

const channelHtml = await (await fetch(`https://www.youtube.com/@${HANDLE}/videos`, { headers: UA })).text();
const ids = [...new Set([...channelHtml.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))];

const decode = (s) => {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
};
const out = [];
for (const id of ids) {
  const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: UA })).text();
  const grab = (re) => html.match(re)?.[1];
  const desc = grab(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  out.push({
    id,
    title: grab(/<meta name="title" content="([^"]*)"/)
      ?.replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"'),
    uploadDate: grab(/"uploadDate":"([^"]+)"/) ?? grab(/<meta itemprop="uploadDate" content="([^"]+)"/),
    lengthSeconds: Number(grab(/"lengthSeconds":"(\d+)"/)) || null,
    description: desc ? decode(desc) : null,
    url: `https://youtu.be/${id}`,
  });
}
fs.writeFileSync(
  "docs/blog-youtube-videos.json",
  JSON.stringify({ channel: `https://www.youtube.com/@${HANDLE}`, fetched_at: new Date().toISOString(), videos: out }, null, 2) + "\n",
);
console.log(out.map((v) => `${v.id}\t${v.uploadDate?.slice(0, 10)}\t${v.lengthSeconds}s\t${v.title}`).join("\n"));
