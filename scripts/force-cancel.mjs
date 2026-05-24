import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l && !l.startsWith("#") && l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: stuck } = await svc.from("analyses").select("id, user_id, credits_charged").eq("status", "running");
console.log(`Found ${stuck?.length ?? 0} running jobs`);
for (const r of stuck ?? []) {
  await svc.from("analyses").update({ status: "refunded", error: "Cancelled: Gemini Pro free-tier quota exhausted. Switched to Flash — try again.", finished_at: new Date().toISOString() }).eq("id", r.id);
  const { data: p } = await svc.from("profiles").select("credits").eq("id", r.user_id).single();
  if (p) await svc.from("profiles").update({ credits: p.credits + (r.credits_charged ?? 1) }).eq("id", r.user_id);
  console.log(`  cancelled ${r.id}, refunded ${r.credits_charged ?? 1}`);
}
