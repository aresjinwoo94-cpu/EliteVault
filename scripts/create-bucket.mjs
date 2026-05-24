/**
 * Idempotently creates the `screenshots` public bucket used by the
 * Inngest analyzer pipeline. Run any time without harm.
 */
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

const { data: existing } = await svc.storage.getBucket("screenshots");
if (existing) {
  console.log("✓ Bucket 'screenshots' already exists (public:", existing.public, ")");
} else {
  const { error } = await svc.storage.createBucket("screenshots", {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (error) {
    console.error("✗ Failed to create bucket:", error.message);
    process.exit(1);
  }
  console.log("✓ Created public bucket 'screenshots'");
}

// Smoke-test: upload + delete a tiny pixel
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const { error: upErr } = await svc.storage
  .from("screenshots")
  .upload("_healthcheck.png", pixel, { contentType: "image/png", upsert: true });
if (upErr) {
  console.error("✗ Upload test failed:", upErr.message);
  process.exit(1);
}
const { data: pub } = svc.storage.from("screenshots").getPublicUrl("_healthcheck.png");
console.log("✓ Upload OK — public URL:", pub.publicUrl);
await svc.storage.from("screenshots").remove(["_healthcheck.png"]);
console.log("✓ Cleanup OK\n\nReady.");
