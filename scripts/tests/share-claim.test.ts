import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAX_CLAIMS_PER_DAY,
  claimFailureFromRpc,
  emailMatchesStore,
  generateClaimToken,
  hashClaimToken,
  looksLikeClaimToken,
} from "@/lib/share/claim-core";
import { buildOutreachMessage, outreachLink } from "@/lib/analyzer/outreach-message";
import type { SharedAuditRow } from "@/lib/analyzer/share-v2";
import { redactClaimToken, redactEventProperties } from "@/lib/analytics/redact";

/**
 * PR-3 (docs/design-share-claim-unlock-reaudit.md, approved D1–D6): claim a public audit, the $7 unlock on it,
 * manual re-audit. These pin the rules that protect ownership and payments.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const sql = read("supabase/migrations/0046_share_claim.sql");

// ── token ────────────────────────────────────────────────────────────────────

test("claim tokens are 32 random bytes in base64url, stored only as a SHA-256 hash", () => {
  const a = generateClaimToken();
  const b = generateClaimToken();
  assert.notEqual(a, b);
  assert.ok(looksLikeClaimToken(a));
  assert.equal(a.length, 43);
  assert.match(hashClaimToken(a), /^[0-9a-f]{64}$/);
  assert.notEqual(hashClaimToken(a), a);
  assert.equal(hashClaimToken(a), hashClaimToken(a));
  for (const bad of [undefined, null, "", "short", "x".repeat(44), `${a.slice(0, 42)}!`, 123]) {
    assert.equal(looksLikeClaimToken(bad), false);
  }
});

test("the email-domain signal matches the store's own domain only", () => {
  assert.equal(emailMatchesStore("ana@shop.com", "https://www.shop.com/products"), true);
  assert.equal(emailMatchesStore("ana@mail.shop.com", "https://shop.com"), true);
  assert.equal(emailMatchesStore("ana@gmail.com", "https://shop.com"), false);
  assert.equal(emailMatchesStore("ana@othershop.com", "https://shop.com"), false);
  assert.equal(emailMatchesStore("ana@shop.com", null), false);
  assert.equal(emailMatchesStore(null, "https://shop.com"), false);
  assert.equal(emailMatchesStore("not-an-email", "https://shop.com"), false);
});

test("RPC errors map to the reasons the page explains", () => {
  assert.equal(claimFailureFromRpc("invalid_or_used"), "used");
  assert.equal(claimFailureFromRpc("not_found"), "used");
  assert.equal(claimFailureFromRpc("rate_limited"), "rate");
  assert.equal(claimFailureFromRpc("boom"), "error");
  assert.equal(MAX_CLAIMS_PER_DAY, 3);
});

// ── migration 0046 ───────────────────────────────────────────────────────────

test("token and claim tables are server-only", () => {
  for (const t of ["analysis_claim_tokens", "analysis_claims"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated`));
  }
  assert.doesNotMatch(sql, /create policy/i, "no RLS policy: nobody but the service role reads or writes");
  assert.match(sql, /token_hash\s+text primary key/);
});

test("the RPCs are executable by service_role only", () => {
  for (const fn of ["claim_shared_audit(text, text, uuid, boolean)", "revert_claim(uuid)", "repoint_share(uuid, uuid)"]) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), fn);
    assert.ok(sql.includes(`grant execute on function public.${fn} to service_role;`), fn);
  }
  assert.equal((sql.match(/security definer/g) ?? []).length, 3);
});

test("claim_shared_audit is atomic, single-use, rate-limited and transfers ownership", () => {
  const fn = sql.slice(sql.indexOf("function public.claim_shared_audit"), sql.indexOf("function public.revert_claim"));
  assert.match(fn, /for update/, "locks the audit row");
  assert.match(fn, /claimed_at is null/, "a used token is rejected");
  assert.match(fn, /raise exception 'invalid_or_used'/);
  assert.match(fn, /raise exception 'already_owner'/);
  assert.match(fn, /v_recent >= 3/);
  assert.match(fn, /interval '1 day'/);
  assert.match(fn, /update public\.analyses\s+set user_id = p_user/);
  assert.match(fn, /share_indexable = case when p_domain_match then share_indexable else false end/);
  assert.match(fn, /update public\.analysis_claim_tokens\s+set claimed_at = now\(\), claimed_by = p_user/);
  assert.match(fn, /insert into public\.analysis_claims/);
});

test("revert refuses when a $7 unlock was paid, and kills the consumed tokens", () => {
  const fn = sql.slice(sql.indexOf("function public.revert_claim"), sql.indexOf("function public.repoint_share"));
  assert.match(fn, /analysis_unlocks where analysis_id = p_analysis and status = 'paid'/);
  assert.match(fn, /raise exception 'has_paid_unlock'/);
  assert.match(fn, /delete from public\.analysis_claim_tokens/);
});

test("repoint_share moves the link only between two audits of the same user, never for a claimed audit", () => {
  const fn = sql.slice(sql.indexOf("function public.repoint_share"));
  assert.match(fn, /o\.user_id is distinct from n\.user_id or n\.reaudit_of is distinct from o\.id/);
  assert.match(fn, /raise exception 'already_claimed'/);
  assert.match(fn, /raise exception 'not_ready'/);
  assert.match(fn, /capture_blocked/);
  assert.match(fn, /share_slug = null, shared_at = null where id = o\.id/, "clears the old holder first (unique index)");
});

// ── the unlock/payment code is untouched ─────────────────────────────────────

test("the claim never edits the unlock, settlement or Stripe code", () => {
  for (const f of ["lib/share/claim.ts", "lib/share/claim-core.ts", "app/s/[slug]/claim/route.ts", "app/actions/share-admin.ts"]) {
    const src = code(f);
    assert.doesNotMatch(src, /lib\/unlocks\/(settle|entitlement|report-unlock)|stripe/i, f);
  }
});

// ── claim route ──────────────────────────────────────────────────────────────

test("the claim route needs a valid token, a session and a verified email, and uses the atomic RPC", () => {
  const src = code("app/s/[slug]/claim/route.ts");
  assert.match(src, /looksLikeClaimToken\(token\)/);
  assert.match(src, /isClaimTokenValid\(slug, token\)/);
  assert.match(src, /\/sign-up\?next=/, "signed-out visitors go through sign-up and come back");
  assert.match(src, /email_confirmed_at/);
  assert.match(src, /claimSharedAudit\(/);
  assert.match(src, /emailMatchesStore\(user\.email, storeUrl\)/);
  assert.match(src, /\/claimed\?a=/);
});

test("the claimed page only opens for the new owner and fires share_claim_done", () => {
  const page = code("app/s/[slug]/claimed/page.tsx");
  assert.match(page, /\.eq\("user_id", user\.id\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(code("components/share/share-claim-done.tsx"), /SHARE_EVENTS\.claimDone/);
});

// ── public page: owner mode ──────────────────────────────────────────────────

test("the claim block appears only with a live token; the plain page never offers a claim", () => {
  const page = code("app/s/[slug]/page.tsx");
  assert.match(page, /const ownerMode = claimToken \? await isClaimTokenValid\(slug, claimToken\) : false/);
  assert.match(page, /\{ownerMode && claimToken && \(\s*<ShareClaimBlock/);
  assert.match(page, /mode=\{ownerMode \? "owner" : "visitor"\}/);
  assert.match(page, /referrer: "same-origin"/, "the token never leaves through the Referer header");
  const block = code("components/share/share-claim-block.tsx");
  assert.match(block, /SHARE_EVENTS\.claimStart/);
  assert.doesNotMatch(block, /top_fixes|persona/);
});

test("claim copy has no 'free' and no score, the keys match in EN/ES, and the $7 sentence follows the unlock flag", () => {
  const en = JSON.parse(read("lib/i18n/dict/ui-en.json")).sharedPage as Record<string, string>;
  const es = JSON.parse(read("lib/i18n/dict/ui-es.json")).sharedPage as Record<string, string>;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const k of Object.keys(en).filter((x) => x.startsWith("claim"))) {
    assert.doesNotMatch(en[k], /\bfree\b|\d\s*\/\s*100/i, k);
    assert.doesNotMatch(es[k], /\bfree\b|gratis|\d\s*\/\s*100/i, k);
  }
  assert.match(en.claimBody, /\$7/);
  assert.doesNotMatch(en.claimBodyNoUnlock, /\$7/);
});

// ── outreach message ─────────────────────────────────────────────────────────

const ROW: SharedAuditRow = {
  url: "https://shop.com",
  score: 50,
  summary: null,
  screenshot_url: null,
  category_scores: null,
  annotations: [{ message: "The hero never says what the store sells." }],
  created_at: "2026-10-20T10:00:00Z",
  ad_readiness_verdict: "not_ready",
  blocker_count: 2,
  fix_count: 3,
  potential_why: ["x"],
  capture_blocked: false,
};

test("the outreach link carries the claim token only when one is given", () => {
  const t = generateClaimToken();
  const withToken = new URL(outreachLink("https://elitevaultapp.com", "shop-abc", t));
  assert.equal(withToken.searchParams.get("c"), t);
  assert.equal(withToken.searchParams.get("utm_source"), "share");
  assert.equal(new URL(outreachLink("https://elitevaultapp.com", "shop-abc")).searchParams.get("c"), null);
  const msg = buildOutreachMessage({ domain: "shop.com", slug: "shop-abc", row: ROW, baseUrl: "https://elitevaultapp.com", claimToken: t });
  assert.ok(msg.includes(`c=${t}`));
});

// ── owner panel: claim info, revert, manual re-audit only ────────────────────

test("owner actions are owner-only and the re-audit is manual, single and capped", () => {
  const src = code("app/actions/share-admin.ts");
  for (const fn of ["copyOutreachMessage", "revertShareClaim", "startShareReaudit", "replaceShareWithReaudit", "setShareSettings"]) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    assert.match(body.slice(0, 500), /getOwner\(\)/, `${fn} checks the owner first`);
  }
  assert.match(src, /force: true/);
  assert.match(src, /too_soon/, "at most one re-audit of the same audit per 24 h");
  assert.match(src, /a\.user_id !== owner\.id/, "only audits of the owner's own account");
  assert.match(src, /hasActiveClaim\(analysisId\)/, "claimed audits cannot be re-audited from here");
  // no batch, no schedule, no loop over audits
  for (const f of ["app/actions/share-admin.ts", "lib/share/claim.ts", "lib/admin/shared-audits.ts", "components/admin/owner-shared-audits.tsx"]) {
    const s = code(f);
    assert.doesNotMatch(s, /inngest|cron|setInterval/i, f);
    assert.doesNotMatch(s, /\.map\([^)]*createAnalysis|Promise\.all\([^)]*startShareReaudit/, f);
  }
  assert.equal((src.match(/createAnalysis\(/g) ?? []).length, 1, "exactly one call site");
});

test("the panel shows the claim and offers the re-audit in two manual steps", () => {
  const ui = code("components/admin/owner-shared-audits.tsx");
  assert.match(ui, /Reclamada por/);
  assert.match(ui, /startShareReaudit/);
  assert.match(ui, /replaceShareWithReaudit/);
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /Copy outreach message/);
});

// ── hardening from the adversarial review ────────────────────────────────────

test("claim tokens never reach PostHog: plain, encoded in sign-up's next=, and in event properties", () => {
  const tok = generateClaimToken();
  const plain = `https://elitevaultapp.com/s/shop-abc?c=${tok}&utm_source=share`;
  assert.ok(!redactClaimToken(plain).includes(tok));
  assert.match(redactClaimToken(plain), /c=\[redacted\]&utm_source=share/);
  const enc = `https://elitevaultapp.com/sign-up?next=${encodeURIComponent(`/s/shop-abc/claim?c=${tok}`)}`;
  assert.ok(!redactClaimToken(enc).includes(tok));
  const props = redactEventProperties({ $current_url: plain, $referrer: enc, n: 3, arr: [plain] });
  assert.ok(!JSON.stringify(props).includes(tok));
  assert.equal(props.n, 3);
  // wired in: the manual pageview and PostHog's own properties (pageleave, referrer, recordings URL)
  assert.match(code("components/analytics/posthog-provider.tsx"), /redactClaimToken\(url\)/);
  assert.match(code("lib/analytics/posthog.ts"), /sanitize_properties/);
  // and the auth callback no longer logs the query string / next
  const cb = code("app/(auth)/auth/callback/route.ts");
  assert.doesNotMatch(cb, /url: request\.url/);
});

test("the SQL serialises one user's claims, never overwrites a public link and locks the audit on revert", () => {
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\(p_user::text\)\)/);
  assert.match(sql, /if n\.share_slug is not null then raise exception 'not_ready'/);
  const revert = sql.slice(sql.indexOf("function public.revert_claim"), sql.indexOf("function public.repoint_share"));
  assert.match(revert, /perform 1 from public\.analyses where id = p_analysis for update/);
});

test("a failed re-audit does not block the owner for 24 h", () => {
  assert.match(code("app/actions/share-admin.ts"), /\.in\("status", \["queued", "running", "succeeded"\]\)/);
});
