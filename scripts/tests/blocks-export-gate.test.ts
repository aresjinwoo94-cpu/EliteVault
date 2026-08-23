import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WP-D — the paywall, and the promise that the credit system stays out of it.
 *
 * Static checks over source, in the same spirit as migrations-idempotent and
 * blocks-entry-is-free, and honest about what that can and cannot prove: it
 * can't run the gate, but it can prove the module has no machinery to bypass it
 * with, and that no code path in the feature reaches for credits.
 *
 * Both properties are the kind that decay quietly. A later work package adding
 * "Pro includes 3 exports" is exactly the change that would reach for
 * profiles.credits out of habit — and the owner's instruction is explicit that
 * a future allowance gets its own meter (a row count per month, the shape
 * meta_simulations already uses), never the audit pool.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Strip comments so the prose explaining a rule can't trip the rule. */
function codeOf(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const EXPORT_ACTION = codeOf(read("app/actions/blocks-export.ts"));

/** Every module that makes up the feature. */
const FEATURE_FILES = [
  "app/actions/blocks.ts",
  "app/actions/blocks-preview.ts",
  "app/actions/blocks-compose.ts",
  "app/actions/blocks-export.ts",
  "lib/blocks/export-pricing.ts",
  "inngest/functions/blocks-preview.ts",
  "components/blocks/export-panel.tsx",
];

test("nothing in Liquid Blocks touches the credit pool", () => {
  // The owner's correction, made mechanical. Credits are the AUDIT currency:
  // charging a download from them locks it away from the Free user standing at
  // the moment of highest intent, and eats a paying merchant's audits.
  for (const file of FEATURE_FILES) {
    const src = codeOf(read(file));
    for (const forbidden of ["credits", "assertQuota", "LIQUID_EXPORT_COST"]) {
      assert.ok(
        !src.includes(forbidden),
        `${file} references \`${forbidden}\` — the export is a standalone Stripe purchase and must never draw on profiles.credits.`,
      );
    }
  }
});

test("the export action checks for payment before it generates anything", () => {
  // Ordering is the property, not merely presence: generating first and
  // checking after would put a complete snippet in memory — and one careless
  // early return away from the caller — before anyone had paid.
  //
  // Measured inside exportLiquid's own body. Scanning the whole file compared
  // the position of the IMPORT of generateLiquidBlock against a call further
  // down, which is a fact about import order and says nothing about the gate.
  const body = EXPORT_ACTION.slice(
    EXPORT_ACTION.indexOf("export async function exportLiquid"),
  );
  assert.ok(body.length > 0, "exportLiquid not found — this test needs updating");
  const gate = body.indexOf("hasPaidExport");
  const generate = body.indexOf("generateLiquidBlock");
  assert.ok(gate !== -1, "no payment check in the export action");
  assert.ok(generate !== -1, "no generation in the export action");
  assert.ok(
    gate < generate,
    "the payment check must come before generation, not after",
  );
});

test("only the export action can produce a snippet", () => {
  // The paywall holds because there is exactly one door. A second caller of the
  // generator — a route handler, a preview step, a debug endpoint — would be a
  // second door, and nothing about it would look wrong in review.
  const callers = [
    "app/actions/blocks.ts",
    "app/actions/blocks-preview.ts",
    "app/actions/blocks-compose.ts",
    "app/api/blocks-projects/[id]/route.ts",
    "inngest/functions/blocks-preview.ts",
  ];
  for (const file of callers) {
    const src = codeOf(read(file));
    assert.ok(
      !src.includes("generateLiquidBlock"),
      `${file} generates Liquid — the only place that may is the paid export action.`,
    );
  }
});

test("the polling endpoint returns no column that could carry a snippet", () => {
  // The column list is what the browser can see for free, on a timer. A
  // `block_liquid` added here later would hand the snippet over without anyone
  // noticing it had become a leak.
  const src = read("app/api/blocks-projects/[id]/route.ts");
  const columns = src.match(/const COLUMNS\s*=\s*\n?\s*"([^"]+)"/)?.[1];
  assert.ok(columns, "COLUMNS not found — this test needs updating, not deleting");
  for (const forbidden of ["liquid", "snippet", "export", "code"]) {
    assert.ok(
      !columns.includes(forbidden),
      `the polling endpoint selects "${forbidden}" — nothing carrying the paid artefact may be readable before payment.`,
    );
  }
});

test("payment is settled from Stripe's own record, never from the client's word", () => {
  // A session id arrives in a URL, so it is the client's word. Everything that
  // decides whether someone paid — the buyer, the project, the payment status —
  // has to come from the session Stripe hands back.
  assert.ok(EXPORT_ACTION.includes("stripe.checkout.sessions.retrieve"));
  assert.ok(
    EXPORT_ACTION.includes("payment_status"),
    "the confirmation doesn't check payment_status",
  );
  assert.ok(
    EXPORT_ACTION.includes("blocks_project_id") &&
      EXPORT_ACTION.includes("supabase_user_id"),
    "the confirmation doesn't verify the session belongs to this project and buyer",
  );
});

test("settling a payment is idempotent on the Stripe session", () => {
  // The webhook dedupes by EVENT id, which cannot protect against the same
  // session arriving under two different event ids — nor against the eager
  // confirmation racing the webhook, which is the normal case.
  assert.ok(EXPORT_ACTION.includes("onConflict"), "the settle path isn't an upsert");
  assert.ok(EXPORT_ACTION.includes("stripe_session_id"));
});

test("a one-time purchase does not fall through to the subscription handler", () => {
  // syncSubscription early-returns on a session with no subscription, so before
  // WP-D a Liquid Blocks payment was recorded and then silently did nothing.
  const webhook = codeOf(read("app/api/stripe/webhook/route.ts"));
  const branch = webhook.indexOf('session.mode === "payment"');
  assert.ok(branch !== -1, "the webhook has no one-time purchase branch");
  assert.ok(
    webhook.includes("settleExport"),
    "the webhook branch doesn't settle the export",
  );
  // The existing subscription path must still be reachable.
  assert.ok(webhook.includes("syncSubscription"));
});

test("the export price is never hardcoded in the repo", () => {
  // It lives on the Stripe Price. A number here would drift the moment the
  // owner changed it, and the figure shown before paying would stop matching
  // the amount charged.
  const pricing = codeOf(read("lib/blocks/export-pricing.ts"));
  assert.ok(pricing.includes("STRIPE_PRICE_LIQUID_EXPORT"));
  assert.ok(
    !/amountCents\s*[:=]\s*\d/.test(pricing),
    "an amount is hardcoded in the pricing module",
  );
});

test("the env var is documented for whoever has to set it", () => {
  const example = read(".env.example");
  assert.ok(example.includes("STRIPE_PRICE_LIQUID_EXPORT"));
});

test("the guard would actually catch a violation", () => {
  // Guards the guard: a broken codeOf returning "" makes every assertion above
  // vacuously true.
  assert.ok(codeOf('const x = "credits";').includes("credits"));
  assert.ok(!codeOf("// credits\n/* assertQuota */").includes("assertQuota"));
});
