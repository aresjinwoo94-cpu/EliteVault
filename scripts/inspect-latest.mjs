import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l && !l.startsWith("#") && l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await svc.from("analyses").select("id, url, status, result, meta_ads, created_at").eq("status","succeeded").order("created_at",{ascending:false}).limit(2);
for (const a of data) {
  console.log("─".repeat(60));
  console.log("id:", a.id);
  console.log("url:", a.url);
  console.log("created:", a.created_at);
  console.log("category_scores:", JSON.stringify(a.result?.category_scores));
  console.log("first annotation x,y:", a.result?.annotations?.[0]?.x, a.result?.annotations?.[0]?.y);
  console.log("meta_ads present?", a.meta_ads ? "YES" : "NO");
}
