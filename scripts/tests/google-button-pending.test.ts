import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "../../lib/i18n/messages";

/**
 * WP-3 (docs/analyzer-mejora-definitiva.md §6.2/§7) — the Google button gives
 * immediate feedback while the OAuth redirect is in flight.
 *
 * The button posts to the `signInWithGoogle` server action, which calls
 * Supabase and then redirects the whole page to Google. With no pending state
 * the click looks like it did nothing for that round trip. The fix reads the
 * form's own status with `useFormStatus()` (it must live in a component
 * rendered INSIDE the <form> to see that form's submission).
 *
 * The test runner has no DOM renderer under its react-server condition, so the
 * contract is pinned on the source, comments stripped.
 */

const src = readFileSync(resolve(process.cwd(), "components/auth/auth-form.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** The body of a top-level `function Name(...) { ... }`, by brace matching. */
function fnBody(name: string): string {
  const start = src.search(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `function ${name} not found`);
  const open = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

test("the Google submit button reads its form's pending state with useFormStatus", () => {
  assert.match(src, /import\s*\{[^}]*\buseFormStatus\b[^}]*\}\s*from\s*["']react-dom["']/);
  const btn = fnBody("GoogleSubmitButton");
  assert.match(btn, /useFormStatus\(\)/);
  assert.match(btn, /disabled=\{pending\}/, "must be disabled while pending (no double submit)");
  assert.match(btn, /aria-busy=\{pending\}/, "must announce the busy state");
  assert.match(btn, /animate-spin/, "must show a spinner while pending");
  assert.match(
    btn,
    /<Loader2\s+className="[^"]*animate-spin[^"]*"\s+aria-hidden="true"\s*\/>/,
    "the spinner is decorative; the label carries the meaning",
  );
  assert.match(btn, /t\(\s*["']auth\.redirecting["']\s*\)/, "pending label is i18n");
  assert.match(btn, /t\(\s*["']auth\.continueWithGoogle["']\s*\)/, "idle label unchanged");
  assert.match(btn, /<GoogleGlyph\s*\/>/, "keeps the inline Google glyph");
});

test("GoogleButton still posts to signInWithGoogle, carries `next`, and renders the submit INSIDE the form", () => {
  const gb = fnBody("GoogleButton");
  assert.match(gb, /<form\s+action=\{signInWithGoogle\}>/);
  assert.match(gb, /<input\s+type="hidden"\s+name="next"\s+value=\{nextUrl\}\s*\/>/);
  const formOpen = gb.indexOf("<form");
  const formClose = gb.indexOf("</form>");
  const submitAt = gb.indexOf("<GoogleSubmitButton");
  assert.ok(submitAt > formOpen && submitAt < formClose, "useFormStatus only sees a parent <form>");
  // Exactly one usage in the whole file, so a second copy rendered outside
  // any form (where useFormStatus would never report pending) can't slip in.
  assert.equal((src.match(/<GoogleSubmitButton\b/g) ?? []).length, 1);
});

test("the glyph stays inline SVG — no external image", () => {
  const glyph = fnBody("GoogleGlyph");
  assert.match(glyph, /<svg\b/);
  assert.doesNotMatch(glyph, /<img\b|src=/);
});

test("the pending label exists in both locales", () => {
  const en = (messages.en as Record<string, Record<string, unknown>>).auth;
  const es = (messages.es as Record<string, Record<string, unknown>>).auth;
  assert.equal(en.redirecting, "Redirecting…");
  assert.equal(es.redirecting, "Redirigiendo…");
});
