/**
 * Cleans up stuck analyses left in `running` state (e.g. from a crashed
 * Inngest run) and rewrites a generic refund message with a useful one.
 * Refunds credits for jobs that were stuck.
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
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 1) Cancel stuck-running jobs (>5 min old)
const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
const { data: stuck } = await svc
  .from("analyses")
  .select("id, user_id, started_at")
  .eq("status", "running")
  .lt("started_at", cutoff);

for (const row of stuck ?? []) {
  console.log(`Cancelling stuck job ${row.id} (started ${row.started_at})`);
  await svc
    .from("analyses")
    .update({
      status: "refunded",
      error:
        "Job timed out. Most likely the Gemini free-tier quota was exhausted — try again with a fresh quota window.",
      finished_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  // refund credit
  const { data: prof } = await svc
    .from("profiles")
    .select("credits")
    .eq("id", row.user_id)
    .single();
  if (prof) {
    await svc
      .from("profiles")
      .update({ credits: prof.credits + 1 })
      .eq("id", row.user_id);
    console.log(`  refunded 1 credit to ${row.user_id} (now ${prof.credits + 1})`);
  }
}

// 2) Rewrite generic refund messages
const { data: generic } = await svc
  .from("analyses")
  .select("id")
  .eq("status", "refunded")
  .eq("error", "Analysis failed after retries — credit refunded");
for (const row of generic ?? []) {
  await svc
    .from("analyses")
    .update({
      error:
        "Gemini quota exhausted (gemini-2.5-pro is paid-tier only). Switched to gemini-2.5-flash — try again.",
    })
    .eq("id", row.id);
  console.log(`Updated generic error on ${row.id}`);
}

console.log("\nDone.");
