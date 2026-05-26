// Twitter card uses the same artwork as the Open Graph image.
//
// Note: Next.js Turbopack requires the route-segment config exports
// (`runtime`, `size`, `contentType`, `alt`) to be literal values in
// THIS file — re-exporting them via `export { … } from "./opengraph-image"`
// fails the build with "Next.js can't recognize the exported runtime field".
// So we duplicate the config and only re-export the default Image function.
export { default } from "./opengraph-image";

export const runtime = "edge";
export const alt = "EliteVault — Copy what actually converts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
