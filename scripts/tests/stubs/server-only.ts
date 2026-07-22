/**
 * Stand-in for the `server-only` marker package.
 *
 * Next.js resolves `server-only` itself (it's how a module declares "this must
 * never reach the client"), so the package isn't in node_modules and a plain
 * `node --test` run can't import any module that uses it. This empty module is
 * mapped in place of it by scripts/tests/tsconfig.json — tests only, never
 * part of the app build.
 */
export {};
