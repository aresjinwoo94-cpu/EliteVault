/**
 * Liquid Blocks WP-C — the gate on generated Liquid.
 *
 * # Why this exists when the prompt already asks for the same thing
 * The brief names the PROMPT as the technical guarantee that a block can't
 * break a theme. A prompt is a request; a model complies with it most of the
 * time. The failure this protects against isn't a malformed block — it's a
 * merchant pasting a global `img { }` rule into a live storefront and finding
 * out from a customer. At that cost, "most of the time" isn't a guarantee, so
 * the prompt states the rule and this enforces it.
 *
 * It fails CLOSED. Anything it can't confidently read is rejected and the
 * caller falls back to the deterministic template that produced the preview the
 * user already approved. Rejecting a good snippet costs us a nicer-worded
 * block; accepting a bad one costs the merchant their product page.
 *
 * Every problem is reported, not just the first, because the caller feeds the
 * list back to the model for one retry — a list that stopped early would make
 * that retry a guessing game.
 */

import { BLOCK_PREFIX, selectorsOf } from "./render-block";

export type LiquidValidation =
  | { ok: true }
  | { ok: false; problems: string[] };

/** A block snippet is a few KB. Anything near this is not a block. */
const MAX_SNIPPET_CHARS = 40_000;

/**
 * Liquid tags that reach OUTSIDE the snippet. `{% render %}` and `{% include %}`
 * pull in theme files, which makes the block's behaviour depend on code we
 * never saw — so "this cannot break your theme" would stop being something we
 * can say. `{% javascript %}` and `{% stylesheet %}` are section-only tags that
 * silently do nothing in a snippet, so their presence means the model was
 * writing the wrong kind of file.
 */
const FORBIDDEN_LIQUID_TAGS =
  /\{%-?\s*(render|include|section|sections|javascript|stylesheet|schema|layout|form)\b/i;

export function validateLiquidSnippet(snippet: string): LiquidValidation {
  const problems: string[] = [];
  const src = (snippet ?? "").trim();

  if (!src) return { ok: false, problems: ["The snippet is empty."] };
  if (src.length > MAX_SNIPPET_CHARS) {
    return { ok: false, problems: [`The snippet is implausibly large (${src.length} characters).`] };
  }

  // ── Nothing that executes, nothing that phones out ────────────────────────
  if (/<script\b/i.test(src)) problems.push("Contains a <script> tag.");
  if (/<iframe\b/i.test(src)) problems.push("Contains an <iframe>.");
  if (/<link\b/i.test(src)) problems.push("Contains a <link> to an external stylesheet.");
  if (/\son[a-z]+\s*=/i.test(src)) problems.push("Contains an inline event handler (on… attribute).");
  if (/@import/i.test(src)) problems.push("Contains an @import.");
  if (/url\s*\(\s*['"]?https?:/i.test(src)) {
    problems.push("Loads an external resource from a URL in CSS.");
  }
  const forbiddenTag = src.match(FORBIDDEN_LIQUID_TAGS);
  if (forbiddenTag) {
    problems.push(
      `Uses {% ${forbiddenTag[1]} %}, which pulls in code from outside this snippet.`,
    );
  }

  // ── It has to be a block ──────────────────────────────────────────────────
  // The root class is what every selector below hangs off, and what the
  // install instructions tell the merchant to look for.
  const rootPattern = new RegExp(`class\\s*=\\s*["'][^"']*\\b${BLOCK_PREFIX}\\b`);
  if (!rootPattern.test(src)) {
    problems.push(`No element carries the block class "${BLOCK_PREFIX}".`);
  }

  const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  if (styles.length === 0) {
    // A block with no CSS inherits whatever the theme does to a bare div — the
    // "looks foreign on the page" outcome this whole feature exists to prevent.
    // It also means the measured tokens were ignored.
    problems.push("Has no <style> block, so it ignores the store's measured design.");
  }

  // ── The containment rule ──────────────────────────────────────────────────
  for (const css of styles) {
    for (const selector of selectorsOf(css)) {
      // Must START with the prefix. `body .ev-blk` targets the block too, but
      // it drags `body` into the match and picks a specificity fight with the
      // theme; only descendants OF the block are in bounds.
      if (!selector.startsWith(`.${BLOCK_PREFIX}`)) {
        problems.push(
          `Selector "${selector}" is not scoped to .${BLOCK_PREFIX} — it would restyle the theme.`,
        );
      }
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
