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

const { data } = await svc
  .from("analyses")
  .select("id, status, result")
  .eq("id", "18f9fa4c-0009-425e-ba91-ab5e2ec4709f")
  .single();

console.log("id:", data.id);
console.log("status:", data.status);
console.log("\nresult keys:", Object.keys(data.result ?? {}));
console.log("\nresult preview:");
console.log(JSON.stringify(data.result, null, 2).slice(0, 1200));
