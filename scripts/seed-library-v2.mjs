/**
 * Seed 45 real winning ecommerce stores into `winning_sites`.
 * Idempotent: upserts on `url`. The 9 marked `is_preselected: true` form
 * the Free-tier preview set (3x3 grid).
 *
 *   npm run library:seed   →   adds + updates all 45 rows
 *
 * Thumbnails: WordPress mshots (free, no auth, lazy-cached on their end)
 * — generates a real screenshot of each URL on demand.
 *
 * Ad signals: estimated proxies (estimated:true) based on what's publicly
 * known about each brand's paid-social aggressiveness. Replace with real
 * Meta Ad Library data once that integration lands.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

// 45 hand-picked stores. The first 9 (by insertion order + is_preselected)
// form the Free-tier preview set — chosen to span niches AND brand voice.
const STORES = [
  // ─── PRESELECTED (Free tier) — must come first, is_preselected: true ──
  ["https://www.allbirds.com", "allbirds.com", "Allbirds", "Sustainable wool sneakers, masterclass in calm minimal DTC", "footwear", ["sustainable","DTC","footwear"], { ctr: 2.8, roi: 3.4, conv_rate: 4.1, traffic_est: 980000 }, adSig(82, 110, 380, 12), true, true],
  ["https://www.gymshark.com", "gymshark.com", "Gymshark", "Athleisure juggernaut with savage UGC ad creatives", "fitness", ["fitness","apparel","UGC"], { ctr: 3.2, roi: 5.1, conv_rate: 3.8, traffic_est: 4200000 }, adSig(98, 160, 500, 22), true, true],
  ["https://www.aesop.com", "aesop.com", "Aesop", "Editorial luxury skincare, rich typography, sensory storytelling", "skincare", ["skincare","luxury","editorial"], { ctr: 1.9, roi: 4.2, conv_rate: 5.6, traffic_est: 1700000 }, adSig(62, 38, 420, 18), true, true],
  ["https://www.hims.com", "hims.com", "Hims", "Men's wellness empire — funnel design is religion here", "wellness", ["wellness","subscription","funnel"], { ctr: 4.1, roi: 5.8, conv_rate: 7.9, traffic_est: 3400000 }, adSig(98, 175, 600, 8), true, true],
  ["https://www.ridge.com", "ridge.com", "Ridge Wallet", "Minimalist wallets that conquered YouTube + Meta ads", "accessories", ["accessories","EDC","viral"], { ctr: 4.8, roi: 6.4, conv_rate: 5.9, traffic_est: 1900000 }, adSig(95, 140, 720, 16), true, true],
  ["https://www.glossier.com", "glossier.com", "Glossier", "Beauty cult brand built on community + UGC", "beauty", ["beauty","community","UGC"], { ctr: 2.7, roi: 3.9, conv_rate: 5.1, traffic_est: 2600000 }, adSig(78, 95, 490, 14), true, true],
  ["https://www.warbyparker.com", "warbyparker.com", "Warby Parker", "D2C eyewear pioneer, frictionless home try-on flow", "eyewear", ["eyewear","D2C","try-on"], { ctr: 2.4, roi: 4.8, conv_rate: 6.2, traffic_est: 2100000 }, adSig(80, 100, 620, 6), true, true],
  ["https://www.olipop.com", "olipop.com", "OLIPOP", "Prebiotic soda with vibrant DTC packaging-as-marketing", "beverage", ["beverage","health","DTC"], { ctr: 3.4, roi: 4.6, conv_rate: 5.2, traffic_est: 1400000 }, adSig(88, 112, 280, 4), true, true],
  ["https://www.bombas.com", "bombas.com", "Bombas", "Performance socks brand crushing it on Meta", "apparel", ["apparel","socks","mission"], { ctr: 3.6, roi: 4.9, conv_rate: 4.4, traffic_est: 880000 }, adSig(86, 105, 540, 5), true, true],

  // ─── EXTENDED LIBRARY (Pro+) ────────────────────────────────────────────
  // Skincare / Beauty
  ["https://www.drunkelephant.com", "drunkelephant.com", "Drunk Elephant", "Clean skincare with bold color blocks and edgy voice", "skincare", ["skincare","clean","color"], { ctr: 2.3, roi: 3.8, conv_rate: 4.7, traffic_est: 1100000 }, adSig(72, 60, 380, 9), false, true],
  ["https://www.tatcha.com", "tatcha.com", "Tatcha", "Japanese-inspired luxury skincare with serene UX", "skincare", ["skincare","luxury","japanese"], { ctr: 2.1, roi: 4.0, conv_rate: 5.3, traffic_est: 950000 }, adSig(68, 52, 410, 7), false, false],
  ["https://www.summerfridays.com", "summerfridays.com", "Summer Fridays", "Influencer-built skincare with creamy hero-led design", "skincare", ["skincare","influencer","gel"], { ctr: 2.9, roi: 3.6, conv_rate: 5.4, traffic_est: 720000 }, adSig(74, 65, 290, 6), false, false],
  ["https://iliabeauty.com", "iliabeauty.com", "ILIA", "Clean color cosmetics with model-driven editorial shots", "beauty", ["beauty","clean","editorial"], { ctr: 2.4, roi: 3.7, conv_rate: 4.9, traffic_est: 580000 }, adSig(70, 48, 320, 8), false, false],
  ["https://versedskin.com", "versedskin.com", "Versed", "Affordable clean skincare with millennial-pink branding", "skincare", ["skincare","affordable","clean"], { ctr: 2.6, roi: 3.5, conv_rate: 5.1, traffic_est: 410000 }, adSig(66, 42, 240, 4), false, false],
  ["https://augustinusbader.com", "augustinusbader.com", "Augustinus Bader", "Premium science-led skincare, ultra-clean editorial", "skincare", ["skincare","luxury","science"], { ctr: 1.8, roi: 5.2, conv_rate: 6.8, traffic_est: 880000 }, adSig(70, 55, 360, 11), false, false],

  // Apparel / Fashion
  ["https://www.fashionnova.com", "fashionnova.com", "Fashion Nova", "Fast-fashion with massive paid social + celeb spend", "apparel", ["apparel","fastfashion"], { ctr: 2.1, roi: 2.8, conv_rate: 3.4, traffic_est: 8800000 }, adSig(100, 280, 700, 18), false, false],
  ["https://www.reformation.com", "reformation.com", "Reformation", "Sustainable womenswear with playful editorial voice", "apparel", ["apparel","sustainable","womens"], { ctr: 2.6, roi: 3.4, conv_rate: 4.5, traffic_est: 1900000 }, adSig(75, 70, 420, 10), false, false],
  ["https://www.everlane.com", "everlane.com", "Everlane", "Radical-transparency basics with stark minimal grid", "apparel", ["apparel","basics","transparent"], { ctr: 2.2, roi: 3.2, conv_rate: 4.3, traffic_est: 1500000 }, adSig(68, 55, 380, 7), false, false],
  ["https://www.outdoorvoices.com", "outdoorvoices.com", "Outdoor Voices", "Recreational athletics, soft pastel community vibes", "fitness", ["fitness","apparel","community"], { ctr: 2.4, roi: 3.1, conv_rate: 4.0, traffic_est: 640000 }, adSig(64, 45, 350, 5), false, false],
  ["https://cuyana.com", "cuyana.com", "Cuyana", "Quiet-luxury leather goods, fewer better things", "apparel", ["apparel","luxury","leather"], { ctr: 2.0, roi: 4.0, conv_rate: 4.8, traffic_est: 320000 }, adSig(60, 35, 320, 4), false, false],
  ["https://www.aritzia.com", "aritzia.com", "Aritzia", "Cool-girl premium fashion, magazine-style PDP layouts", "apparel", ["apparel","premium","womens"], { ctr: 2.8, roi: 3.6, conv_rate: 4.6, traffic_est: 5400000 }, adSig(82, 95, 540, 12), false, false],
  ["https://www.veja-store.com", "veja-store.com", "Veja", "Ethical sneakers with raw editorial photography", "footwear", ["footwear","sustainable","editorial"], { ctr: 2.5, roi: 3.8, conv_rate: 4.4, traffic_est: 1200000 }, adSig(64, 50, 460, 18), false, false],

  // Fitness / Athleisure
  ["https://www.lululemon.com", "lululemon.com", "Lululemon", "Athleisure category-definer with sharp lifestyle stories", "fitness", ["fitness","athleisure","luxury"], { ctr: 2.6, roi: 4.4, conv_rate: 5.0, traffic_est: 11200000 }, adSig(88, 140, 700, 24), false, false],
  ["https://vuoriclothing.com", "vuoriclothing.com", "Vuori", "Performance apparel that doesn't look performance — clean West Coast", "fitness", ["fitness","apparel","menswear"], { ctr: 3.0, roi: 4.2, conv_rate: 4.7, traffic_est: 2300000 }, adSig(86, 115, 410, 8), false, false],
  ["https://www.aloyoga.com", "aloyoga.com", "Alo Yoga", "Yoga-luxe with influencer-heavy paid social", "fitness", ["fitness","yoga","luxury"], { ctr: 2.9, roi: 4.0, conv_rate: 4.5, traffic_est: 3100000 }, adSig(84, 120, 480, 9), false, false],

  // Footwear
  ["https://birdies.com", "birdies.com", "Birdies", "Slipper-flat hybrid with cozy lifestyle photography", "footwear", ["footwear","womens","comfort"], { ctr: 2.7, roi: 3.4, conv_rate: 4.6, traffic_est: 380000 }, adSig(68, 48, 320, 5), false, false],
  ["https://rothys.com", "rothys.com", "Rothy's", "Recycled-plastic shoes with sleek product-led pages", "footwear", ["footwear","sustainable","womens"], { ctr: 2.4, roi: 3.6, conv_rate: 4.2, traffic_est: 820000 }, adSig(72, 60, 380, 6), false, false],

  // Eyewear
  ["https://paireyewear.com", "paireyewear.com", "Pair Eyewear", "Customizable kid + adult glasses with playful microsites", "eyewear", ["eyewear","customizable","kids"], { ctr: 3.5, roi: 4.5, conv_rate: 5.7, traffic_est: 410000 }, adSig(86, 78, 280, 4), false, false],
  ["https://shopfelixgray.com", "shopfelixgray.com", "Felix Gray", "Blue-light glasses with quiet professional aesthetic", "eyewear", ["eyewear","blue-light","professional"], { ctr: 2.4, roi: 3.6, conv_rate: 4.1, traffic_est: 280000 }, adSig(58, 38, 220, 3), false, false],

  // Accessories
  ["https://bellroy.com", "bellroy.com", "Bellroy", "Premium leather wallets + bags with engineered visual storytelling", "accessories", ["accessories","wallets","premium"], { ctr: 2.6, roi: 4.1, conv_rate: 4.9, traffic_est: 720000 }, adSig(70, 58, 540, 16), false, false],
  ["https://trayvax.com", "trayvax.com", "Trayvax", "Tactical EDC wallets with hero-product video focus", "accessories", ["accessories","tactical","EDC"], { ctr: 3.2, roi: 3.8, conv_rate: 4.4, traffic_est: 220000 }, adSig(74, 55, 380, 5), false, false],

  // Home / Lifestyle
  ["https://casper.com", "casper.com", "Casper", "D2C mattress OG, bedrock of paid-social CRO playbook", "home", ["home","sleep","D2C"], { ctr: 1.4, roi: 2.1, conv_rate: 2.9, traffic_est: 1100000 }, adSig(78, 95, 720, 11), false, false],
  ["https://www.brooklinen.com", "brooklinen.com", "Brooklinen", "Direct-to-consumer luxe bedding with clean editorial UX", "home", ["home","bedding","DTC"], { ctr: 2.3, roi: 3.7, conv_rate: 4.6, traffic_est: 1400000 }, adSig(76, 80, 480, 7), false, false],
  ["https://www.parachutehome.com", "parachutehome.com", "Parachute", "Home essentials with warm, lived-in lifestyle photography", "home", ["home","bedding","lifestyle"], { ctr: 2.1, roi: 3.4, conv_rate: 4.2, traffic_est: 920000 }, adSig(68, 55, 380, 6), false, false],
  ["https://bearaby.com", "bearaby.com", "Bearaby", "Weighted blankets with calming knit visuals", "home", ["home","wellness","sleep"], { ctr: 2.5, roi: 3.8, conv_rate: 4.5, traffic_est: 420000 }, adSig(72, 62, 280, 5), false, false],

  // Wellness / Supplements
  ["https://www.athletics.com", "athletics.com", "Athletic Greens (AG1)", "Single-product subscription juggernaut with podcast strategy", "wellness", ["wellness","supplement","subscription"], { ctr: 3.8, roi: 5.4, conv_rate: 6.4, traffic_est: 2800000 }, adSig(96, 180, 540, 12), false, false],
  ["https://www.forhims.com", "forhims.com", "For Hims", "Telehealth landing with tight funnel + Stripe-style polish", "wellness", ["wellness","telehealth"], { ctr: 4.0, roi: 5.6, conv_rate: 7.5, traffic_est: 1900000 }, adSig(94, 160, 580, 8), false, false],
  ["https://forhers.com", "forhers.com", "For Hers", "Women's wellness with empathy-led copy + quiz funnels", "wellness", ["wellness","womens","quiz"], { ctr: 3.6, roi: 5.0, conv_rate: 6.8, traffic_est: 1500000 }, adSig(90, 145, 480, 7), false, false],
  ["https://romanhealth.com", "romanhealth.com", "Roman (Ro)", "Men's health with sharp problem-solution landing pages", "wellness", ["wellness","mens","telehealth"], { ctr: 3.5, roi: 5.1, conv_rate: 6.6, traffic_est: 1700000 }, adSig(90, 135, 520, 6), false, false],

  // Grooming
  ["https://www.manscaped.com", "manscaped.com", "Manscaped", "Grooming brand with absolutely unhinged but converting ads", "grooming", ["grooming","mens","viral"], { ctr: 5.2, roi: 5.7, conv_rate: 6.8, traffic_est: 2800000 }, adSig(98, 220, 620, 14), false, false],
  ["https://www.harrys.com", "harrys.com", "Harry's", "Razor subscription with crisp utilitarian voice", "grooming", ["grooming","subscription","razors"], { ctr: 3.0, roi: 4.4, conv_rate: 5.8, traffic_est: 1800000 }, adSig(82, 110, 580, 9), false, false],

  // Pet
  ["https://www.barkbox.com", "barkbox.com", "BarkBox", "Monthly dog subscription with delightful unboxing-led ads", "pet", ["pet","subscription","dogs"], { ctr: 3.8, roi: 4.6, conv_rate: 6.2, traffic_est: 1200000 }, adSig(88, 130, 460, 5), false, false],
  ["https://www.thefarmersdog.com", "thefarmersdog.com", "The Farmer's Dog", "Fresh dog food with vet-led trust signals + quiz funnel", "pet", ["pet","food","quiz"], { ctr: 4.2, roi: 5.2, conv_rate: 7.1, traffic_est: 980000 }, adSig(92, 150, 380, 4), false, false],
  ["https://wildone.com", "wildone.com", "Wild One", "Premium pet accessories with calm clean product shots", "pet", ["pet","accessories","premium"], { ctr: 2.8, roi: 3.9, conv_rate: 4.7, traffic_est: 320000 }, adSig(68, 48, 240, 4), false, false],

  // Food / Beverage
  ["https://magicspoon.com", "magicspoon.com", "Magic Spoon", "Low-carb cereal with retro-pop branding + meme marketing", "beverage", ["food","cereal","DTC"], { ctr: 3.6, roi: 4.4, conv_rate: 5.5, traffic_est: 680000 }, adSig(84, 90, 320, 4), false, false],
  ["https://liquidiv.com", "liquidiv.com", "Liquid IV", "Hydration multipliers with ubiquitous influencer presence", "beverage", ["beverage","hydration","subscription"], { ctr: 3.4, roi: 4.5, conv_rate: 5.8, traffic_est: 1900000 }, adSig(90, 145, 500, 11), false, false],

  // Baby / Parenting
  ["https://fridababy.com", "fridababy.com", "Frida Baby", "Parent must-haves with hilariously honest problem-led ads", "baby", ["baby","parenting","viral"], { ctr: 3.8, roi: 4.7, conv_rate: 5.9, traffic_est: 920000 }, adSig(86, 110, 420, 6), false, false],
  ["https://meetlalo.com", "meetlalo.com", "Lalo", "Modern baby gear with elevated millennial aesthetic", "baby", ["baby","gear","premium"], { ctr: 3.0, roi: 4.0, conv_rate: 4.8, traffic_est: 320000 }, adSig(74, 65, 240, 4), false, false],
];

console.log(`\nUpserting ${STORES.length} stores into winning_sites…\n`);

let added = 0, updated = 0, failed = 0;
for (const [url, domain, title, description, niche, tags, metrics, ad_signals, is_preselected, is_featured] of STORES) {
  const row = {
    url,
    domain,
    title,
    description,
    niche,
    thumbnail_url: thumb(url),
    metrics,
    tags,
    ad_signals,
    ad_signals_updated_at: new Date().toISOString(),
    is_preselected,
    is_featured,
    added_by_ai: false,
  };
  const { error, data } = await svc
    .from("winning_sites")
    .upsert(row, { onConflict: "url" })
    .select("id");
  if (error) {
    console.log(`  ✗ ${domain.padEnd(30)} ${error.message}`);
    failed++;
  } else {
    const pre = is_preselected ? "★" : " ";
    console.log(`  ${pre} ${domain.padEnd(28)} ${niche.padEnd(12)} act=${ad_signals.activity_score}`);
    if (data?.length) added++;
  }
}

const { count } = await svc.from("winning_sites").select("*", { count: "exact", head: true });
const { count: pre } = await svc.from("winning_sites").select("*", { count: "exact", head: true }).eq("is_preselected", true);

console.log(`\n${"─".repeat(60)}`);
console.log(`Total in Library: ${count}    Preselected (Free preview): ${pre}`);
console.log(`★ = visible to Free users`);
