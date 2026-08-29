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
 * an EMPTY box — the four newest blocks, the ones most in need of explaining.
 *
 * Checked against the SOURCE rather than by rendering: the component is a
 * client component with no DOM in this runner, and the failure mode is
 * structural — a type the switch does not mention.
 *
 * # These guards were weak, and a verifier proved it
 * The first version of this file passed against three separately broken
 * implementations: two types drawing byte-identical shapes, an icon library
 * imported and used, and an ungated `animate-bounce hover:-translate-y-4`.
 * Each hole is named at the test that closes it, because a guard that reports
 * green on the thing it exists to catch is worse than no guard — it is a guard
 * somebody is trusting.
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

/** The drawing instructions for one type's branch, comments stripped. */
function branchOf(body: string, id: string): string {
  const at = body.indexOf(`type === "${id}"`);
  assert.notEqual(at, -1, `${id} has no branch`);
  const nextAt = BLOCK_CATALOG.map((b) => body.indexOf(`type === "${b.id}"`))
    .filter((i) => i > at)
    .sort((a, b) => a - b)[0];
  return body.slice(at, nextAt ?? body.length).replace(/\/\*[\s\S]*?\*\//g, "");
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

test("no two block types draw the same picture", () => {
  /**
   * Nine cards that look alike are nine cards nobody can tell apart, which is
   * the problem the diagrams exist to solve.
   *
   * The first version compared a list of TAG NAMES, lowercase-only. That missed
   * two things at once: the `<Line>` helper carries most of the geometry in
   * eight of the nine branches and starts with a capital, so it was invisible
   * to the scan; and comparing tags without their coordinates meant a genuine
   * duplicate could be waved through by reordering two elements. A verifier
   * made assurance_bar and low_stock draw byte-identical shapes and all four
   * tests still passed.
   *
   * The signature now carries the geometry — every numeric attribute, sorted,
   * so order cannot disguise sameness — and counts <Line> as the element it is.
   */
  const body = thumbBody();
  const seen = new Map<string, string>();

  for (const { id } of BLOCK_CATALOG) {
    const slice = branchOf(body, id);
    const elements = slice.match(/<(?:Line|rect|circle|path|g|line|polygon|ellipse)\b/g) ?? [];
    // Every number and every path command in the branch, sorted: two branches
    // that place the same shapes at the same coordinates collide however their
    // source is ordered.
    const geometry = [
      ...(slice.match(/-?\d+(?:\.\d+)?/g) ?? []),
      ...(slice.match(/[MmLlHhVvCcSsQqTtAaZz](?=[\s\d-])/g) ?? []),
    ].sort();
    const signature = `${elements.sort().join(",")}|${geometry.join(",")}`;

    assert.ok(elements.length > 0, `${id}'s branch draws nothing`);
    const clash = [...seen.entries()].find(([, s]) => s === signature);
    assert.equal(
      clash?.[0],
      undefined,
      `${id} draws exactly what ${clash?.[0]} draws — one was copied and never adapted`,
    );
    seen.set(id, signature);
  }
});

test("the diagrams are self-contained: no external images, no icon library", () => {
  /**
   * Nine cards render at once, and nine requests to explain nine choices is the
   * bloat this product argues against.
   *
   * Scanned over the WHOLE FILE, not the Thumb body. The first version looked
   * only inside Thumb, so `import { ShieldCheck } from "lucide-react"` — which
   * necessarily sits above it — was undetectable by the test whose own name
   * promised to catch icon imports. A verifier imported one, used it in a
   * diagram, and the suite stayed green.
   */
  for (const forbidden of ["<img", "<image", "url(", "http://", "https://", "xlink:href"]) {
    assert.ok(
      !source.includes(forbidden),
      `the gallery references something external: ${forbidden}`,
    );
  }
  const imports = source.match(/^import[\s\S]*?from\s+"([^"]+)"/gm) ?? [];
  const iconish = imports.filter((i) =>
    /lucide|heroicons|react-icons|@tabler|feather|phosphor/i.test(i),
  );
  assert.deepEqual(
    iconish,
    [],
    `the diagrams pull in an icon library: ${iconish.join(" | ")}`,
  );
});

test("no movement in this file escapes the reduced-motion gate", () => {
  /**
   * A motion preference is an accessibility setting, not a style opinion — for
   * some people animation is a vestibular trigger.
   *
   * Two holes in the first version, both proven live. It only read
   * `className="…"` literals, so the card's own className — built by string
   * concatenation in a JSX expression — was never scanned at all; and it
   * accepted a string if `motion-safe:` appeared ANYWHERE in it, so
   * `motion-safe:transition-transform group-hover:-translate-y-0.5` passed
   * while gating only the transition and leaving the transform to run as an
   * instant jump. That is worse than no animation for the person the gate is
   * for.
   *
   * Now: every string literal in the file, and every movement utility inside it
   * must carry the prefix itself.
   */
  const MOVEMENT = /(?:^|[\s"'`])((?:hover:|group-hover:|focus:)?(?:-?translate-[xy]-|scale-|rotate-|animate-|transition\b)[^\s"'`]*)/g;
  const offenders: string[] = [];

  for (const [literal] of source.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g)) {
    for (const m of literal.matchAll(MOVEMENT)) {
      const utility = m[1];
      // `transition-colors` is a paint change, not movement; it does not
      // trigger the response a motion preference is asking us to avoid.
      if (utility.startsWith("transition-colors")) continue;
      if (!utility.includes("motion-safe:")) offenders.push(utility);
    }
  }

  assert.deepEqual(
    [...new Set(offenders)],
    [],
    `movement that ignores prefers-reduced-motion: ${[...new Set(offenders)].join(", ")}`,
  );
});
