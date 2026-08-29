import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCK_CATALOG } from "../../lib/blocks/catalog";

/**
 * Every catalogue type must have a diagram, and it must be its own.
 *
 * The defect this pins shipped: `Thumb` had five branches and the catalogue had
 * nine, so spec_table, assurance_bar, bundle_tiers and low_stock each rendered
 * an EMPTY box. A card whose picture is blank reads as "not finished" rather
 * than "not illustrated" — and it was the four newest blocks, the ones most in
 * need of explaining, that had it.
 *
 * Checked against the SOURCE rather than by rendering. The component is a
 * client component with no DOM in this test runner, and the failure mode is
 * structural: a type the switch does not mention. Adding a tenth block type
 * without drawing it fails here, on the same commit that adds it, instead of
 * being noticed by whoever opens the gallery next.
 */

const SRC = join(process.cwd(), "components/blocks/block-gallery.tsx");
const source = readFileSync(SRC, "utf8");

/** The body of the `Thumb` component, brace-matched. */
function thumbBody(): string {
  const at = source.indexOf("function Thumb(");
  assert.notEqual(at, -1, "Thumb is no longer a function declaration in block-gallery.tsx");
  const open = source.indexOf("{", source.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error("unbalanced braces in Thumb");
}

test("every block type has a diagram branch", () => {
  const body = thumbBody();
  const missing = BLOCK_CATALOG.map((b) => b.id).filter(
    (id) => !body.includes(`type === "${id}"`),
  );
  assert.deepEqual(
    missing,
    [],
    `these types render a blank thumbnail: ${missing.join(", ")}`,
  );
});

test("no two block types share a diagram", () => {
  /**
   * A branch each is not enough — nine cards that all look alike are nine cards
   * nobody can tell apart, which is the problem the diagrams exist to solve.
   * Comparing the drawing instructions per type catches a copy-paste that was
   * never adapted.
   */
  const body = thumbBody();
  const drawings = new Map<string, string>();

  for (const { id } of BLOCK_CATALOG) {
    const at = body.indexOf(`type === "${id}"`);
    assert.notEqual(at, -1, `${id} has no branch`);
    // From the branch marker to the start of the next one, or the end.
    const nextAt = BLOCK_CATALOG.map((b) => body.indexOf(`type === "${b.id}"`))
      .filter((i) => i > at)
      .sort((a, b) => a - b)[0];
    const slice = body.slice(at, nextAt ?? body.length);
    // Geometry only: the numbers and shapes, not the prose around them.
    const shape = (slice.match(/<(rect|circle|path|g|line|polygon)\b/g) ?? []).join(",");
    assert.ok(shape.length > 0, `${id}'s branch draws nothing`);
    const clash = [...drawings.entries()].find(([, s]) => s === shape);
    assert.equal(
      clash,
      undefined,
      `${id} draws exactly the same shapes as ${clash?.[0]} — one of them was copied and never adapted`,
    );
    drawings.set(id, shape);
  }
});

test("the diagrams are self-contained: no external images or icon imports", () => {
  /**
   * Nine cards render at once. Nine network requests to explain nine choices is
   * the bloat this product argues against, and an icon library pulled in for
   * thumbnails is the same cost wearing a nicer name.
   */
  const body = thumbBody();
  for (const forbidden of ["<img", "<image", "url(", "http://", "https://", "<Image"]) {
    assert.ok(
      !body.includes(forbidden),
      `the diagrams reference something external: ${forbidden}`,
    );
  }
});

test("the hover animation is gated on prefers-reduced-motion", () => {
  /**
   * A motion preference is an accessibility setting, not a style opinion — for
   * some people animation is a vestibular trigger. Tailwind's `motion-safe:`
   * compiles to @media (prefers-reduced-motion: no-preference), so an
   * unprefixed transform/transition here would run regardless of what the
   * visitor asked their OS for.
   */
  const animated = source.match(/className="[^"]*(?:transition|translate|animate)[^"]*"/g) ?? [];
  const ungated = animated.filter(
    (c) => /translate-y|animate-/.test(c) && !c.includes("motion-safe:"),
  );
  assert.deepEqual(
    ungated,
    [],
    `movement that ignores prefers-reduced-motion: ${ungated.join(" | ")}`,
  );
});
