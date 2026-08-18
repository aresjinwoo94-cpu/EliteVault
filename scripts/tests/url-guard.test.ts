import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublicStoreUrl } from "../../lib/security/url-guard";

/**
 * SSRF guard for the anonymous audit (activation funnel Tarea 1).
 *
 * The anonymous endpoint fetches a URL that any visitor can submit without an
 * account, so the guard is the wall that keeps localhost / private ranges /
 * weird schemes out of the pipeline. These cases lock in that behaviour.
 */

test("accepts a bare public domain and adds https", () => {
  const r = validatePublicStoreUrl("yourstore.com");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.url, "https://yourstore.com");
});

test("accepts a normal https store URL", () => {
  const r = validatePublicStoreUrl("https://cooljewelry.myshopify.com");
  assert.equal(r.ok, true);
});

test("rejects localhost (name and loopback IP)", () => {
  assert.equal(validatePublicStoreUrl("http://localhost:3000").ok, false);
  assert.equal(validatePublicStoreUrl("localhost").ok, false);
  assert.equal(validatePublicStoreUrl("127.0.0.1").ok, false);
});

test("rejects the cloud metadata link-local address", () => {
  assert.equal(
    validatePublicStoreUrl("http://169.254.169.254/latest/meta-data").ok,
    false,
  );
});

test("rejects RFC1918 private ranges", () => {
  assert.equal(validatePublicStoreUrl("http://192.168.1.10").ok, false);
  assert.equal(validatePublicStoreUrl("10.0.0.5").ok, false);
  assert.equal(validatePublicStoreUrl("http://172.16.4.4").ok, false);
});

test("rejects IPv6 loopback", () => {
  assert.equal(validatePublicStoreUrl("http://[::1]").ok, false);
});

test("rejects non-http(s) schemes", () => {
  assert.equal(validatePublicStoreUrl("ftp://store.com").ok, false);
  assert.equal(validatePublicStoreUrl("javascript:alert(1)").ok, false);
  assert.equal(validatePublicStoreUrl("file:///etc/passwd").ok, false);
});

test("rejects embedded credentials", () => {
  assert.equal(validatePublicStoreUrl("http://user:pass@store.com").ok, false);
});

test("rejects a single-label internal hostname", () => {
  assert.equal(validatePublicStoreUrl("internalhost").ok, false);
});

test("rejects empty input", () => {
  assert.equal(validatePublicStoreUrl("").ok, false);
  assert.equal(validatePublicStoreUrl("   ").ok, false);
});
