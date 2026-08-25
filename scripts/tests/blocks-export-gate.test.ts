import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Every .ts/.tsx file under `dir`, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/**
 * The body of one function, by brace matching from its declaration.
 *
 * Needed because scanning a whole FILE for a string proves almost nothing —
 * the first version of the "settled from Stripe's record" test below passed on
 * strings that live in a different function entirely.
 */
function bodyOf(src: string, fnName: string): string {
  const decl = new RegExp(`(?:export\\s+)?async\\s+function\\s+${fnName}\\b`);
  const at = src.search(decl);
  if (at === -1) return "";

  /**
   * Find the BODY's opening brace, not the first `{` after the name.
   *
   * A return type like `Promise<{ ok: boolean }>` contains a brace, and taking
   * that one made every body come back as its own type annotation — which is
   * how these assertions looked like they were checking a function and were
   * really checking six words of TypeScript. Parameters and generics are
   * skipped by depth so only a brace at the top level counts.
   */
  let paren = 0;
  let angle = 0;
  let open = -1;
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === "<") angle++;
    else if (c === ">") angle = Math.max(0, angle - 1);
    else if (c === "{" && paren === 0 && angle === 0) {
      open = i;
      break;
    }
  }
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

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

/**
 * The body where a function's real work happens.
 *
 * Every action in this feature is now a thin try/catch that delegates to a
 * helper — the fix for actions taking the whole page down when they threw. That
 * left these security assertions inspecting a wrapper containing nothing but a
 * `return await doThing(...)`, which would have passed while the validations
 * they check had been deleted.
 *
 * Resolving one hop keeps the assertions pointed at the code that matters
 * without hardcoding the helper names, so they survive the next refactor and
 * still fail if the checks themselves go.
 */
function effectiveBody(src: string, fnName: string): string {
  const body = bodyOf(src, fnName);
  // A wrapper delegates to exactly one helper and does nothing else of note.
  const delegate = body.match(/return await (\w+)\(/);
  if (!delegate) return body;
  const inner = bodyOf(src, delegate[1]);
  return inner ? `${body}\n${inner}` : body;
}

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
  //
  // Scoped to confirmExportPayment's own body. Searching the whole file made
  // this near-vacuous: `blocks_project_id` and `supabase_user_id` also appear
  // in startExportCheckout's metadata block, so every validation branch here
  // could be deleted and the test would still pass.
  // Follows the delegation: the action is now a thin guard that hands off to a
  // helper, so the validations live one level down. Resolving that hop rather
  // than pointing the test at the helper by name means the test keeps working
  // whichever way the code is arranged, and keeps FAILING if the validations
  // disappear.
  const body = effectiveBody(EXPORT_ACTION, "confirmExportPayment");
  assert.ok(body.includes("stripe.checkout.sessions.retrieve"));
  assert.ok(body.includes("payment_status"), "doesn't check payment_status");
  assert.ok(
    body.includes("meta.blocks_project_id !== projectId"),
    "doesn't verify the session was opened for THIS project",
  );
  assert.ok(
    body.includes("meta.supabase_user_id !== user.id"),
    "doesn't verify the session was opened for THIS buyer",
  );
  assert.ok(
    body.includes('meta.purchase !== "liquid_export"'),
    "doesn't verify the session is an export purchase at all",
  );
});

test("settlement checks payment_status on BOTH paths, not just the eager one", () => {
  // The webhook path calls settleExport directly. When only the eager path
  // checked, an unpaid `checkout.session.completed` would have been written as
  // paid — impossible today because every configured payment method is
  // synchronous, and a free export the day anyone enables ACH, SEPA, Klarna or
  // a 100%-off promo code in the Stripe dashboard. Nobody making that change
  // would think to look at this file.
  const settle = codeOf(read("lib/blocks/settle-export.ts"));
  assert.ok(
    settle.includes('session.payment_status !== "paid"'),
    "settleExport writes a paid row without checking the payment actually succeeded",
  );
});

test("every server action in the export module authenticates", () => {
  // The hole that got through review: EVERY exported async function in a
  // "use server" module is a public HTTP endpoint. `settleExport` was exported
  // from here, took a Stripe session as its argument, did no auth, and wrote
  // with the SERVICE-ROLE client — walking straight around the SELECT-only RLS
  // that was supposed to protect the money table. The only thing in the way was
  // the reference id not yet being in a client chunk, which is obscurity.
  assert.ok(
    EXPORT_ACTION.trimStart().startsWith('"use server"'),
    "this test assumes the module is a server-action module",
  );
  const exported = [...EXPORT_ACTION.matchAll(/export\s+async\s+function\s+(\w+)/g)].map(
    (m) => m[1],
  );
  assert.ok(exported.length > 0, "no exported actions found — the check is vacuous");
  for (const name of exported) {
    const body = effectiveBody(EXPORT_ACTION, name);
    assert.ok(
      body.includes("auth.getUser()"),
      `${name}() is a public endpoint that never authenticates. Either authenticate it, or move it to a server-only module that isn't a server action (see lib/blocks/settle-export.ts).`,
    );
  }
});

test("the money table stays readable-only to the client", () => {
  // The RLS shape IS the protection, and a later migration adding
  // `for all using (auth.uid() = user_id)` would let anyone insert their own
  // row with status 'paid' — opening the front door with nothing failing.
  const sql = read("supabase/migrations/0035_blocks_exports.sql").toLowerCase();
  assert.ok(sql.includes("enable row level security"));
  const policies = [...sql.matchAll(/create\s+policy[^;]*?\bfor\s+(\w+)/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    policies,
    ["select"],
    `blocks_exports must expose SELECT and nothing else to the client; found: ${policies.join(", ")}`,
  );
});

test("no file anywhere in the repo reaches for credits on behalf of Blocks", () => {
  // The hardcoded list in the test above is an allowlist, and the scenario it
  // exists to prevent is a FUTURE file — "Pro includes 3 exports" landing in a
  // new module that reaches for the audit pool out of habit. So this one
  // sweeps every source file that mentions Blocks at all.
  const roots = ["app", "lib", "components", "inngest", "ai"];
  /**
   * The Stripe webhook is shared infrastructure. It legitimately grants
   * subscription credits (`onInvoicePaid`) AND routes the Blocks export branch,
   * so it matches on both counts without either being wrong. Excluded by path
   * and by name so the exemption is deliberate and visible rather than a
   * loophole in the pattern.
   */
  const SHARED = ["app/api/stripe/webhook/route.ts"];
  const offenders: string[] = [];
  for (const root of roots) {
    for (const file of walk(join(ROOT, root))) {
      if (!/\.(ts|tsx)$/.test(file) || file.includes("node_modules")) continue;
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
      if (SHARED.includes(rel)) continue;
      const raw = readFileSync(file, "utf8");
      if (!/blocks_projects|blocks_exports|liquid-block|blocks\//i.test(raw)) continue;
      const src = codeOf(raw);
      if (/\bcredits\b|assertQuota/.test(src)) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these Blocks files reach for the audit credit pool: ${offenders.join(", ")}`,
  );
});

test("settling a payment is idempotent on the Stripe session", () => {
  // The webhook dedupes by EVENT id, which cannot protect against the same
  // session arriving under two different event ids — nor against the eager
  // confirmation racing the webhook, which is the normal case.
  const settle = codeOf(read("lib/blocks/settle-export.ts"));
  assert.ok(settle.includes("onConflict"), "the settle path isn't an upsert");
  assert.ok(settle.includes("stripe_session_id"));
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
