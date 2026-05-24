/**
 * End-to-end smoke test:
 *   1. Verify all 6 tables exist
 *   2. Create a fresh test user via the auth.signUp endpoint
 *   3. Confirm the on_auth_user_created trigger created a profile row
 *   4. Hit each public route via http://localhost:3000 and assert 200
 *   5. Run the seed (idempotent) so Library has content
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = env.SUPABASE_SERVICE_ROLE_KEY;
const svcClient = createClient(url, svc, { auth: { persistSession: false } });

const check = (label, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? "  " + detail : ""}`);
  if (!ok) process.exitCode = 1;
};

// 1) Tables
console.log("\n— Tables —");
for (const t of [
  "profiles",
  "subscriptions",
  "analyses",
  "winning_sites",
  "search_history",
  "stripe_events",
]) {
  const { count, error } = await svcClient
    .from(t)
    .select("*", { count: "exact", head: true });
  check(`table ${t}`, !error, `(${count ?? "?"} rows)`);
}

// 2 + 3) Signup + trigger
console.log("\n— Auth + trigger —");
const email = `smoketest+${Date.now()}@gmail.com`;
const anonClient = createClient(url, anon);
const { data: signed, error: sErr } = await anonClient.auth.signUp({
  email,
  password: "TestPassword123!Strong",
});
check("auth.signUp", !sErr && !!signed?.user, sErr?.message ?? signed?.user?.id);

if (signed?.user?.id) {
  // Wait briefly for the trigger to commit
  await new Promise((r) => setTimeout(r, 1500));
  const { data: prof, error: pErr } = await svcClient
    .from("profiles")
    .select("id, email, plan, credits")
    .eq("id", signed.user.id)
    .single();
  check(
    "profile auto-created by trigger",
    !pErr && prof?.id === signed.user.id,
    pErr?.message ?? `${prof?.email} / plan=${prof?.plan} / credits=${prof?.credits}`,
  );
}

// 4) HTTP routes
console.log("\n— HTTP routes —");
for (const path of ["/", "/sign-in", "/sign-up", "/pricing"]) {
  try {
    const r = await fetch(`http://localhost:3000${path}`);
    check(`GET ${path}`, r.ok, `HTTP ${r.status}`);
  } catch (e) {
    check(`GET ${path}`, false, e.message);
  }
}

// 5) Library seed (only if empty)
console.log("\n— Seed Library —");
const { count: existing } = await svcClient
  .from("winning_sites")
  .select("*", { count: "exact", head: true });
if (existing && existing > 0) {
  check(`Library already seeded`, true, `(${existing} rows)`);
} else {
  const sites = [
    ["https://www.allbirds.com", "allbirds.com", "Allbirds", "Sustainable wool sneakers — clean minimal e-com", "footwear", "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800", { ctr: 2.8, roi: 3.4, conv_rate: 4.1, traffic_est: 980000 }, true],
    ["https://www.gymshark.com", "gymshark.com", "Gymshark", "Athleisure giant with savage ad creatives", "fitness", "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800", { ctr: 3.2, roi: 5.1, conv_rate: 3.8, traffic_est: 4200000 }, true],
    ["https://www.aesop.com", "aesop.com", "Aesop", "Editorial luxury skincare with rich typography", "skincare", "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800", { ctr: 1.9, roi: 4.2, conv_rate: 5.6, traffic_est: 1700000 }, true],
    ["https://www.warbyparker.com", "warbyparker.com", "Warby Parker", "D2C eyewear pioneer with frictionless try-on", "eyewear", "https://images.unsplash.com/photo-1577803645773-f96470509666?w=800", { ctr: 2.4, roi: 4.8, conv_rate: 6.2, traffic_est: 2100000 }, false],
    ["https://www.bombas.com", "bombas.com", "Bombas", "Performance socks brand crushing Meta ads", "apparel", "https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=800", { ctr: 3.6, roi: 4.9, conv_rate: 4.4, traffic_est: 880000 }, false],
    ["https://www.hims.com", "hims.com", "Hims", "Men's wellness — masterclass in funnel design", "wellness", "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=800", { ctr: 4.1, roi: 5.8, conv_rate: 7.9, traffic_est: 3400000 }, true],
    ["https://www.glossier.com", "glossier.com", "Glossier", "Beauty brand with cult community + UGC", "beauty", "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800", { ctr: 2.7, roi: 3.9, conv_rate: 5.1, traffic_est: 2600000 }, false],
    ["https://www.casper.com", "casper.com", "Casper", "Direct-to-consumer mattresses — bedrock CRO", "home", "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800", { ctr: 1.4, roi: 2.1, conv_rate: 2.9, traffic_est: 1100000 }, false],
    ["https://www.ridge.com", "ridge.com", "Ridge Wallet", "Minimalist wallet brand that conquered YouTube ads", "accessories", "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800", { ctr: 4.8, roi: 6.4, conv_rate: 5.9, traffic_est: 1900000 }, true],
    ["https://www.manscaped.com", "manscaped.com", "Manscaped", "Grooming brand with unhinged but converting ads", "grooming", "https://images.unsplash.com/photo-1583416750470-965b2707b355?w=800", { ctr: 5.2, roi: 5.7, conv_rate: 6.8, traffic_est: 2800000 }, false],
    ["https://www.olipop.com", "olipop.com", "OLIPOP", "Prebiotic soda — vibrant DTC packaging story", "beverage", "https://images.unsplash.com/photo-1543253687-c931c8e01820?w=800", { ctr: 3.4, roi: 4.6, conv_rate: 5.2, traffic_est: 1400000 }, false],
    ["https://www.fashionnova.com", "fashionnova.com", "Fashion Nova", "Fast-fashion with massive paid social spend", "apparel", "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800", { ctr: 2.1, roi: 2.8, conv_rate: 3.4, traffic_est: 8800000 }, false],
  ];
  const rows = sites.map(([url, domain, title, description, niche, thumbnail_url, metrics, is_featured]) => ({
    url, domain, title, description, niche, thumbnail_url, metrics, is_featured,
  }));
  const { error: insErr, count: inserted } = await svcClient
    .from("winning_sites")
    .upsert(rows, { onConflict: "url", count: "exact" });
  check("seed Library", !insErr, insErr?.message ?? `(${inserted ?? rows.length} rows)`);
}

console.log("\nDone.");
