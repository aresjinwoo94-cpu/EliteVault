/**
 * v3.6.1 — third-wave curation.
 *
 * Replaces the 9 sites just removed by clean-blocked-library.mjs and tops
 * up the Free-tier "featured" cap (9 sites). Two-step:
 *
 *   1. Promote 4 existing high-quality sites to is_featured = true so the
 *      Free tier still shows 9 picks after Hims / Warby Parker / Gymshark
 *      / Veja got cut.
 *   2. Insert ~15 new candidates (mostly small/medium DTC brands that
 *      don't fingerprint mshots aggressively). For each candidate we fetch
 *      the mshots thumbnail BEFORE inserting — only sites that return
 *      >= 40KB image content get persisted. No more silent bad-data.
 *
 * Usage: node scripts/add-curated-v4.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);
const svc = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const thumb = (url) =>
  `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=800&h=560`;

const adSig = (score, ads, days, regions) => ({
  active_ads: ads,
  days_running_max: days,
  region_count: regions,
  last_seen: new Date().toISOString().slice(0, 10),
  activity_score: score,
  estimated: true,
});

// ─── Step 1: promote existing sites to featured ───────────────────────────
// These 4 already exist in the DB, are well-known DTC brands, and
// passed the Cloudflare check in the last verification pass.
const PROMOTE_TO_FEATURED = [
  "mejuri.com",
  "liquiddeath.com",
  "brooklinen.com",
  "tecovas.com",
];

console.log("Step 1 — promoting 4 existing sites to featured…");
const { error: promoteErr } = await svc
  .from("winning_sites")
  .update({ is_featured: true })
  .in("domain", PROMOTE_TO_FEATURED);

if (promoteErr) {
  console.warn(`  ⚠ promote failed: ${promoteErr.message}`);
} else {
  for (const d of PROMOTE_TO_FEATURED) {
    console.log(`  ★ ${d}`);
  }
}

// ─── Step 2: candidate sites to add — only inserted if thumbnail loads ───
const CANDIDATES = [
  // Beauty / skincare (lots of small Shopify, usually mshots-friendly)
  [
    "https://www.tatcha.com",
    "tatcha.com",
    "Tatcha",
    "Japanese-inspired skincare with cinematic ingredient hero stories",
    "skincare",
    ["beauty", "skincare", "luxury"],
    { ctr: 2.4, roi: 3.7, conv_rate: 4.8, traffic_est: 980000 },
    adSig(74, 80, 360, 6),
  ],
  [
    "https://www.farmacybeauty.com",
    "farmacybeauty.com",
    "Farmacy",
    "Honey-based skincare with botanical product styling",
    "skincare",
    ["beauty", "skincare", "natural"],
    { ctr: 2.5, roi: 3.6, conv_rate: 4.5, traffic_est: 280000 },
    adSig(66, 55, 240, 4),
  ],
  [
    "https://soldejaneiro.com",
    "soldejaneiro.com",
    "Sol de Janeiro",
    "Brazilian beauty with viral perfume mist and warm aesthetic",
    "beauty",
    ["beauty", "fragrance", "viral"],
    { ctr: 3.6, roi: 4.4, conv_rate: 5.6, traffic_est: 1600000 },
    adSig(90, 140, 380, 8),
  ],

  // Apparel / lifestyle
  [
    "https://www.taylorstitch.com",
    "taylorstitch.com",
    "Taylor Stitch",
    "California heritage menswear with field-tested storytelling",
    "apparel",
    ["apparel", "menswear", "heritage"],
    { ctr: 2.4, roi: 3.5, conv_rate: 4.3, traffic_est: 320000 },
    adSig(64, 50, 280, 4),
  ],
  [
    "https://www.aritzia.com",
    "aritzia.com",
    "Aritzia",
    "Editorial-grade womenswear with seasonal lookbook moments",
    "apparel",
    ["apparel", "womenswear", "editorial"],
    { ctr: 2.7, roi: 3.9, conv_rate: 4.7, traffic_est: 3200000 },
    adSig(82, 120, 420, 9),
  ],
  [
    "https://www.frankandoak.com",
    "frankandoak.com",
    "Frank And Oak",
    "Canadian eco-conscious menswear with muted lifestyle photography",
    "apparel",
    ["apparel", "menswear", "sustainable"],
    { ctr: 2.2, roi: 3.3, conv_rate: 4.1, traffic_est: 240000 },
    adSig(60, 42, 260, 4),
  ],

  // Home / kitchen
  [
    "https://hedleyandbennett.com",
    "hedleyandbennett.com",
    "Hedley & Bennett",
    "Premium chef aprons with bold colorways and craft storytelling",
    "home",
    ["home", "kitchen", "craft"],
    { ctr: 2.3, roi: 3.4, conv_rate: 4.2, traffic_est: 180000 },
    adSig(58, 38, 220, 3),
  ],
  [
    "https://www.materialkitchen.com",
    "materialkitchen.com",
    "Material",
    "Beautifully designed kitchen tools with editorial product shots",
    "home",
    ["home", "kitchen", "design"],
    { ctr: 2.5, roi: 3.5, conv_rate: 4.4, traffic_est: 220000 },
    adSig(62, 42, 240, 3),
  ],

  // Wellness / supplements
  [
    "https://drinkag1.com",
    "drinkag1.com",
    "AG1",
    "Premium greens powder with science-forward credibility design",
    "wellness",
    ["wellness", "supplement", "premium"],
    { ctr: 2.8, roi: 4.0, conv_rate: 5.0, traffic_est: 2400000 },
    adSig(86, 150, 540, 8),
  ],
  [
    "https://thenue.co",
    "thenue.co",
    "The Nue Co.",
    "Functional supplements with minimal apothecary aesthetic",
    "wellness",
    ["wellness", "supplement", "minimal"],
    { ctr: 2.4, roi: 3.6, conv_rate: 4.6, traffic_est: 320000 },
    adSig(66, 50, 260, 5),
  ],

  // Food / beverage
  [
    "https://oliveandsalt.com",
    "oliveandsalt.com",
    "Olive & Salt",
    "Artisanal pantry goods with hand-illustrated branding",
    "beverage",
    ["food", "artisan", "pantry"],
    { ctr: 2.4, roi: 3.5, conv_rate: 4.4, traffic_est: 80000 },
    adSig(52, 28, 180, 2),
  ],
  [
    "https://omsom.com",
    "omsom.com",
    "Omsom",
    "Asian American sauces and pantry essentials with playful design",
    "beverage",
    ["food", "asian", "playful"],
    { ctr: 3.0, roi: 3.8, conv_rate: 4.7, traffic_est: 180000 },
    adSig(64, 45, 220, 3),
  ],

  // Accessories
  [
    "https://www.cuyana.com",
    "cuyana.com",
    "Cuyana",
    "Fewer better things — premium leather goods with calm minimalism",
    "accessories",
    ["accessories", "leather", "minimal"],
    { ctr: 2.3, roi: 3.5, conv_rate: 4.3, traffic_est: 280000 },
    adSig(62, 42, 260, 4),
  ],
  [
    "https://www.bellroy.com",
    "bellroy.com",
    "Bellroy",
    "Slim wallets with engineering-grade product photography",
    "accessories",
    ["accessories", "wallets", "design"],
    { ctr: 2.5, roi: 3.6, conv_rate: 4.5, traffic_est: 620000 },
    adSig(72, 65, 320, 6),
  ],
  [
    "https://www.lulus.com",
    "lulus.com",
    "Lulus",
    "Affordable fashion with high-volume Instagram-ready product grid",
    "apparel",
    ["apparel", "fashion", "affordable"],
    { ctr: 2.8, roi: 3.6, conv_rate: 4.4, traffic_est: 4800000 },
    adSig(78, 110, 380, 7),
  ],
];

// Test thumbnail before inserting. Same 40KB threshold as the verify script.
async function thumbnailWorks(url) {
  const thumbUrl = thumb(url);
  // mshots is lazy — first hit triggers capture, second returns the real
  // image. Two retries with 4s delay.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(thumbUrl, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ctype = res.headers.get("content-type") ?? "";
        if (buf.length >= 40000 && ctype.startsWith("image/")) {
          return { ok: true, bytes: buf.length };
        }
      }
    } catch {
      /* retry */
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 4000));
  }
  return { ok: false, bytes: 0 };
}

console.log(
  `\nStep 2 — testing ${CANDIDATES.length} candidates against mshots…\n`,
);

const inserts = [];
for (const c of CANDIDATES) {
  const [url, domain, title, description, niche, tags, metrics, ad_signals] = c;
  const result = await thumbnailWorks(url);
  if (result.ok) {
    console.log(`  ✓ ${domain.padEnd(28)} ${(result.bytes / 1024).toFixed(1)} KB`);
    inserts.push({
      url,
      domain,
      title,
      description,
      niche,
      thumbnail_url: thumb(url),
      tags,
      metrics: { ...metrics, ad_signals },
      added_by_ai: false,
      is_featured: false,
    });
  } else {
    console.log(`  ✗ ${domain.padEnd(28)} thumbnail failed`);
  }
}

if (inserts.length === 0) {
  console.log("\nNo candidates passed — library unchanged.");
  process.exit(0);
}

// Filter out domains already present (no UNIQUE constraint on domain
// in our schema, so a plain insert would create duplicates).
console.log(`\nDeduping against existing rows…`);
const { data: existingDomains } = await svc
  .from("winning_sites")
  .select("domain")
  .in(
    "domain",
    inserts.map((i) => i.domain),
  );
const existing = new Set(
  (existingDomains ?? []).map((r) => r.domain),
);
const fresh = inserts.filter((i) => !existing.has(i.domain));
if (fresh.length < inserts.length) {
  console.log(
    `  ${inserts.length - fresh.length} already in library, skipping.`,
  );
}

if (fresh.length === 0) {
  console.log("All candidates already present. Library unchanged.");
  process.exit(0);
}

console.log(`\nInserting ${fresh.length} new sites…`);
const { error } = await svc.from("winning_sites").insert(fresh);

if (error) {
  console.error("✗ Insert failed:", error.message);
  process.exit(1);
}
console.log("✓ Library refreshed.");
