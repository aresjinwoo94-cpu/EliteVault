/**
 * Verifies that the dev server's supabase-js client (same one our Next.js
 * Server Components use) can actually read tables — bypassing whatever
 * weirdness the raw REST endpoint is showing.
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

console.log("URL:", url);
console.log("anon:", anon?.slice(0, 30) + "…");
console.log("svc :", svc?.slice(0, 30) + "…");

const supa = createClient(url, anon);
const svcClient = createClient(url, svc, { auth: { persistSession: false } });

for (const t of ["winning_sites", "profiles", "analyses", "search_history", "subscriptions"]) {
  const { count, error } = await supa
    .from(t)
    .select("*", { count: "exact", head: true });
  console.log(`anon  ${t.padEnd(15)}: ${error ? `ERR ${error.message}` : `${count} rows`}`);
}

console.log("\n--- via service_role ---");
for (const t of ["winning_sites", "profiles", "analyses", "search_history", "subscriptions"]) {
  const { count, error } = await svcClient
    .from(t)
    .select("*", { count: "exact", head: true });
  console.log(`svc   ${t.padEnd(15)}: ${error ? `ERR ${error.message}` : `${count} rows`}`);
}
