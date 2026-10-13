import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { assessHeroImage } from "../../lib/library/image-quality";

/** WP-L1 — an automatically fetched image must look like a store, not like a logo on a flat background. */
async function flat(w: number, h: number, bg: string, mark?: { color: string; box: number }) {
  let img = sharp({ create: { width: w, height: h, channels: 3, background: bg } });
  if (mark) {
    const svg = Buffer.from(`<svg width="${w}" height="${h}"><rect x="${w * 0.4}" y="${h * 0.4}" width="${mark.box}" height="${mark.box / 3}" fill="${mark.color}"/></svg>`);
    img = img.composite([{ input: svg }]);
  }
  return img.png().toBuffer();
}
async function photoLike(w: number, h: number) {
  // smooth multi-colour gradient + noise ≈ a product/lifestyle photo
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = (x / w) * 255;
      raw[i + 1] = (y / h) * 255;
      raw[i + 2] = ((x + y) % 97) * 2 + ((x * y) % 13);
    }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}

test("a flat logo (Peloton/Gymshark style) is rejected", async () => {
  const peloton = await assessHeroImage(await flat(1200, 630, "#000000", { color: "#ffffff", box: 200 }));
  assert.equal(peloton.ok, false);
  assert.match(peloton.reason!, /flat\/logo/);
  const solid = await assessHeroImage(await flat(1200, 630, "#ffffff"));
  assert.equal(solid.ok, false);
});

test("a colourful photo-like image passes", async () => {
  const v = await assessHeroImage(await photoLike(1200, 800));
  assert.equal(v.ok, true, JSON.stringify(v));
});

test("tiny or odd-ratio images are rejected", async () => {
  assert.equal((await assessHeroImage(await photoLike(300, 200))).ok, false);
  assert.equal((await assessHeroImage(await photoLike(600, 1800))).ok, false);
  assert.equal((await assessHeroImage(Buffer.from("not an image"))).ok, false);
});
