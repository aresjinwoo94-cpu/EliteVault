import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l && !l.startsWith("#") && l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/debug-user.mjs <email>");
  process.exit(1);
}
const { data: prof } = await svc.from("profiles").select("*").eq("email", email).single();
console.log("PROFILE:", prof);

const { data: analyses } = await svc.from("analyses").select("id, status, url, credits_charged, created_at, error").eq("user_id", prof.id).order("created_at", { ascending: false }).limit(15);
console.log(`\nANALYSES (${analyses?.length ?? 0}):`);
for (const a of analyses ?? []) {
  console.log(`  ${a.created_at} | ${a.status.padEnd(10)} | charged=${a.credits_charged} | ${a.url ?? "(screenshot)"} | err=${a.error ?? "—"}`);
}

const { data: subs } = await svc.from("subscriptions").select("*").eq("user_id", prof.id).order("updated_at", { ascending: false });
console.log(`\nSUBSCRIPTIONS (${subs?.length ?? 0}):`);
for (const s of subs ?? []) {
  console.log(`  ${s.id} | ${s.plan} | ${s.status} | period ${s.current_period_start?.slice(0,16)} → ${s.current_period_end?.slice(0,16)} | cancel_at_period_end=${s.cancel_at_period_end}`);
}
