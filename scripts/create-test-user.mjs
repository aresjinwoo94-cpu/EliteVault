/**
 * Create a test user with email + password — no magic link, no rate limits.
 *
 * Uses Supabase Admin API to create the user with email_confirm: true
 * so they can log in immediately. Bypasses the 60s magic-link cooldown
 * and the daily signup quotas that block testing in tight loops.
 *
 * Usage:
 *   node scripts/create-test-user.mjs <email> <password>
 *   node scripts/create-test-user.mjs test@example.com Test12345!
 *
 * If the user already exists, the password is RESET to the new one.
 * Idempotent — safe to re-run.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password || email.startsWith("--") || password.length < 8) {
  console.error(
    "Usage: node scripts/create-test-user.mjs <email> <password>\n" +
      "  Password must be at least 8 characters.",
  );
  process.exit(1);
}

const svc = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Check if user exists
const { data: existing } = await svc.auth.admin.listUsers({ perPage: 200 });
const found = existing?.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);

if (found) {
  console.log(`User ${email} already exists — resetting password.`);
  const { error } = await svc.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("✗ Update failed:", error.message);
    process.exit(1);
  }
  console.log(`✓ Password reset for ${email} (id ${found.id})`);
  console.log(
    `\nLog in at https://elite-vault-rosy.vercel.app/sign-in` +
      `\n  Email mode: Click "Prefer a password?" toggle below the magic link form` +
      `\n  Email:     ${email}` +
      `\n  Password:  ${password}`,
  );
  process.exit(0);
}

const { data: created, error: createErr } = await svc.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr) {
  console.error("✗ Create failed:", createErr.message);
  process.exit(1);
}
console.log(`✓ Created ${email} (id ${created.user?.id})`);

// Ensure they have a profile row (the auth trigger should create one,
// but we double-check and create if missing).
const userId = created.user?.id;
if (userId) {
  const { data: profile } = await svc
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    await svc.from("profiles").insert({
      id: userId,
      email,
      plan: "free",
      credits: 1,
      onboarded: true,
    });
    console.log("  → created profile row");
  }
}

console.log(
  `\nLog in at https://elite-vault-rosy.vercel.app/sign-in` +
    `\n  Email mode: Click "Prefer a password?" toggle below the magic link form` +
    `\n  Email:     ${email}` +
    `\n  Password:  ${password}`,
);
