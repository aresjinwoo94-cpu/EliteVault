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
  // `<base>` rewrites every relative URL on the merchant's page; a refresh meta
  // navigates away from it.
  if (/<base\b/i.test(src)) problems.push("Contains a <base> tag, which would rewrite the page's links.");
  if (/<meta\b/i.test(src)) problems.push("Contains a <meta> tag.");
  if (/<(object|embed)\b/i.test(src)) problems.push("Contains an <object> or <embed>.");
  // `<form>` matters more here than it looks: the install guide places the
  // block directly under the Add to cart button, i.e. INSIDE the theme's
  // product form. A nested form makes the parser close the outer one and
  // orphans the buy button — the block would break checkout without touching a
  // single style.
  if (/<form\b/i.test(src)) {
    problems.push("Contains a <form>, which would break the theme's own product form.");
  }
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
      problems.push(...selectorProblems(selector));
    }

    // Scoping is about SELECTORS, and that turned out to be only half the
    // question. `.ev-blk{position:fixed;inset:0}` is perfectly scoped and turns
    // the block into a full-viewport overlay covering the merchant's entire
    // page — proven in a browser during review. A block sits in the flow of the
    // page; it never pins itself to the window.
    if (/position\s*:\s*(fixed|sticky)/i.test(css)) {
      problems.push(
        "Uses position:fixed or position:sticky, which lifts the block out of the page and can cover the whole store.",
      );
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

/**
 * Is this selector genuinely confined to the block?
 *
 * `startsWith(".ev-blk")` was the first answer and it was wrong twice over,
 * both proven against a real storefront:
 *
 *   - `.ev-blk ~ *` and `.ev-blk + button` start with the prefix and reach
 *     SIDEWAYS out of it. The install guide places the block as a sibling of
 *     the buy button, so those selectors hid the Add to cart control. This is
 *     the exact failure the validator exists to catch, and it sailed through.
 *   - `.ev-blkFOO` starts with the prefix and is a different class entirely.
 *
 * Descendants (` `, `>`) stay inside by construction and are fine.
 */
function selectorProblems(selector: string): string[] {
  const sel = selector.trim();
  if (!sel.startsWith(`.${BLOCK_PREFIX}`)) {
    return [
      `Selector "${sel}" is not scoped to .${BLOCK_PREFIX} — it would restyle the theme.`,
    ];
  }

  // The character right after the prefix decides whether this is our class or
  // one that merely shares its opening letters. A word character or a hyphen
  // means a different class name.
  const after = sel.slice(BLOCK_PREFIX.length + 1, BLOCK_PREFIX.length + 2);
  const isOurClass = after === "" || !/[\w-]/.test(after) || sel.startsWith(`.${BLOCK_PREFIX}__`);
  if (!isOurClass) {
    return [
      `Selector "${sel}" only looks like a block class — .${BLOCK_PREFIX}${after}… is something else.`,
    ];
  }

  if (/[~+]/.test(sel)) {
    return [
      `Selector "${sel}" uses a sibling combinator, which reaches out of the block and can restyle the theme elements next to it.`,
    ];
  }
  return [];
}
