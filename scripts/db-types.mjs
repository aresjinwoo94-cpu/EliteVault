/**
 * Regenerate the Supabase `Database` types from the LIVE schema.
 *
 * Usage:
 *   npm run db:types            write lib/supabase/database.types.ts
 *   npm run db:types -- --check print to stdout, write nothing
 *
 * # Why this isn't `supabase gen types typescript` (WP-6)
 * That command needs the Supabase CLI installed and logged in. The Management
 * API exposes the same generator, and this repo already authenticates to it
 * with SUPABASE_PAT for `npm run db:migrate` — so one credential covers both
 * and there's nothing extra to install. Same output, fewer prerequisites.
 *
 * # What to do with the output
 * The generated file is the SCHEMA half of lib/supabase/types.ts. That file
 * also holds hand-written domain types (AnalysisResult, BuyerPersona, PlanTier,
 * the AUDIT_DIMENSION_LABELS map…) which are NOT derivable from the database
 * and must not be overwritten — which is why this writes to a separate file.
 *
 * Wiring the generated `Database` in place of the hand-written one is a
 * deliberate, reviewable step, not something this script should do behind your
 * back: it is what finally lets `.from(...)` stop resolving to `never`, and it
 * will surface real type errors that the current `as never` casts are hiding.
 * See docs/infra-debt.md for the sequence.
 */
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const pat = env.SUPABASE_PAT;
const ref = env.SUPABASE_PROJECT_REF;
if (!pat || !ref) {
  console.error("✗ SUPABASE_PAT and SUPABASE_PROJECT_REF must be in .env.local");
  process.exit(1);
}

const OUT = "lib/supabase/database.types.ts";
const checkOnly = process.argv.includes("--check");

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${pat}` } },
);
if (!res.ok) {
  console.error(`✗ type generation failed — HTTP ${res.status}`);
  console.error((await res.text()).slice(0, 800));
  process.exit(1);
}

const body = await res.json();
const types = typeof body === "string" ? body : body.types;
if (!types || typeof types !== "string") {
  console.error("✗ unexpected response shape from the type generator");
  process.exit(1);
}

const header = `// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run db:types
//
// This is the live database schema as TypeScript. The hand-written domain types
// (AnalysisResult, BuyerPersona, PlanTier, …) live in lib/supabase/types.ts and
// are NOT derivable from the schema — keep them there.
//
// Generated from Supabase project ${ref}.

`;

if (checkOnly) {
  process.stdout.write(types);
  process.exit(0);
}

writeFileSync(OUT, header + types, "utf8");
console.log(`✓ wrote ${OUT} (${(header + types).length} bytes)`);
console.log("\nNext: see docs/infra-debt.md for how to adopt it without breaking the build.");
