import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await svc
  .from("analyses")
  .select("id, status, url, error, started_at, finished_at, created_at, inngest_run_id, result")
  .order("created_at", { ascending: false })
  .limit(5);

if (error) {
  console.error("Query failed:", error);
  process.exit(1);
}

for (const a of data) {
  console.log("─".repeat(70));
  console.log(`id:           ${a.id}`);
  console.log(`url:          ${a.url}`);
  console.log(`status:       ${a.status}`);
  console.log(`created:      ${a.created_at}`);
  console.log(`started:      ${a.started_at}`);
  console.log(`finished:     ${a.finished_at}`);
  console.log(`inngest_run:  ${a.inngest_run_id}`);
  console.log(`error:        ${a.error}`);
  console.log(`result:       ${a.result ? "(present)" : "null"}`);
  if (a.started_at && a.finished_at) {
    const dt = (new Date(a.finished_at) - new Date(a.started_at)) / 1000;
    console.log(`took:         ${dt}s`);
  }
}
