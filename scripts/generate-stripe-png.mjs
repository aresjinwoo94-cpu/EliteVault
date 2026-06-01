/**
 * Converts public/brand/stripe-logo.svg → stripe-logo.png (512×512).
 *
 * Stripe Dashboard ACCEPTS SVG directly for brand assets, so you don't
 * actually need this. But some users prefer PNG (smaller file, no
 * rendering surprises across browsers). Run this if you want the PNG.
 *
 * Usage:
 *   npm install --save-dev @resvg/resvg-js
 *   node scripts/generate-stripe-png.mjs
 *
 * @resvg/resvg-js is a WASM-backed SVG → raster renderer. No native
 * binaries, works on any platform. Output sits next to the SVG so it's
 * easy to find in public/brand/.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

let Resvg;
try {
  ({ Resvg } = await import("@resvg/resvg-js"));
} catch {
  console.error(
    "✗ @resvg/resvg-js not installed.\n" +
      "  Run: npm install --save-dev @resvg/resvg-js\n" +
      "  Then re-run this script.",
  );
  process.exit(1);
}

const inputPath = resolve("public/brand/stripe-logo.svg");
const outputPath = resolve("public/brand/stripe-logo.png");

const svg = readFileSync(inputPath, "utf-8");
const resvg = new Resvg(svg, {
  // Render at 512x512 — sharp on Retina, plenty for Stripe Dashboard.
  fitTo: { mode: "width", value: 512 },
  background: "transparent",
  font: { loadSystemFonts: false },
});

const png = resvg.render().asPng();
writeFileSync(outputPath, png);

console.log(`✓ Wrote ${outputPath} (${(png.length / 1024).toFixed(1)} KB)`);
console.log("\nUpload this PNG to:");
console.log("  https://dashboard.stripe.com/settings/branding");
console.log("    → Brand assets → Logo");
console.log("    → Brand assets → Icon (same file)");
