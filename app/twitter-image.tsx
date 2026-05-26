// Twitter card uses the same artwork as the Open Graph image.
// Re-exporting keeps them in sync without duplicating ImageResponse code.
export { default } from "./opengraph-image";
export { alt, size, contentType, runtime } from "./opengraph-image";
