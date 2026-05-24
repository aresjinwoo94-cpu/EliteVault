/**
 * Tests the new email+password signup flow end-to-end.
 * If "Confirm email" is OFF in Supabase, signup returns a session immediately.
 * If still ON, signup returns user but no session (and tries to send an email).
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

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const email = `pwsmoke+${Date.now()}@gmail.com`;
const password = "TestPassword123!";
console.log(`\nSign up: ${email}`);

const { data, error } = await supa.auth.signUp({ email, password });
if (error) {
  console.error("✗ signUp failed:", error.message);
  process.exit(1);
}
console.log(`✓ user.id: ${data.user?.id}`);
console.log(`  session: ${data.session ? "✓ immediate (confirm email OFF)" : "✗ none — confirm email still ON"}`);
console.log(`  confirmed_at: ${data.user?.confirmed_at ?? "—"}`);

// Wait briefly for trigger
await new Promise((r) => setTimeout(r, 1500));
const { data: prof, error: pErr } = await svc
  .from("profiles")
  .select("id, email, plan, credits, created_at")
  .eq("id", data.user?.id)
  .single();

if (pErr) {
  console.error("✗ profile row not found:", pErr.message);
  process.exit(1);
}
console.log(`✓ profile auto-created: ${prof.email} / plan=${prof.plan} / credits=${prof.credits}`);

// Now try signing in with the password
console.log(`\nSign in: ${email}`);
const sInClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: si, error: siErr } = await sInClient.auth.signInWithPassword({ email, password });
if (siErr) {
  console.error("✗ signIn failed:", siErr.message);
  process.exit(1);
}
console.log(`✓ session.user.id: ${si.session?.user?.id}`);
console.log(`✓ access_token present: ${!!si.session?.access_token}`);

console.log("\n🎉 Email+password auth fully functional.\n");
