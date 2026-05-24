import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l && !l.startsWith("#") && l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log("─".repeat(70));
console.log("PROFILES");
console.log("─".repeat(70));
const { data: profiles } = await svc.from("profiles").select("id, email, plan, credits, stripe_customer_id, updated_at").order("updated_at", { ascending: false });
for (const p of profiles ?? []) {
  console.log(`${p.email.padEnd(45)} plan=${p.plan.padEnd(6)} credits=${String(p.credits).padEnd(4)} cust=${p.stripe_customer_id?.slice(0,18) ?? "—"}`);
}

console.log("\n" + "─".repeat(70));
console.log("SUBSCRIPTIONS");
console.log("─".repeat(70));
const { data: subs } = await svc.from("subscriptions").select("*").order("updated_at", { ascending: false });
for (const s of subs ?? []) {
  console.log(`user=${s.user_id.slice(0,8)}… plan=${s.plan} status=${s.status} cancel_at_period_end=${s.cancel_at_period_end}`);
  console.log(`  price=${s.price_id}`);
  console.log(`  period: ${s.current_period_start} → ${s.current_period_end}`);
}

console.log("\n" + "─".repeat(70));
console.log("STRIPE WEBHOOK EVENTS");
console.log("─".repeat(70));
const { data: events } = await svc.from("stripe_events").select("id, type, processed_at").order("processed_at", { ascending: false }).limit(15);
for (const e of events ?? []) {
  console.log(`${e.type.padEnd(45)} ${e.processed_at}`);
}
