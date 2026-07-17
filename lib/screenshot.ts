import "server-only";

/**
 * Server-only façade over the screenshot pipeline.
 *
 * The implementation lives in `./screenshot-core` WITHOUT the `server-only`
 * guard, because that module is also imported by standalone CLI scripts (e.g.
 * `scripts/snapshot-library-thumbnails.mts`) running under plain tsx, where
 * `server-only` can't resolve — Next.js provides it internally, it isn't a real
 * installed package.
 *
 * App code (route handlers, server actions, Inngest functions) should keep
 * importing THIS module so the "never bundle me into a client component" guard
 * stays enforced. Scripts import `./screenshot-core` directly.
 */
export { captureScreenshot } from "./screenshot-core";
