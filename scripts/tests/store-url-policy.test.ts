import { test } from "node:test";
import assert from "node:assert/strict";
import { isBareIpHost } from "../../lib/analyzer/store-url-policy";
import { validatePublicStoreUrl } from "../../lib/security/url-guard";

/**
 * The bare-IP rule, and its relationship to the SSRF guard.
 *
 * These are different questions and it matters that they stay separate:
 * url-guard answers "is this safe to fetch?" and correctly allows a PUBLIC IP,
 * because fetching one is not an SSRF risk. This answers "can this be a store?"
 * and says no.
 *
 * Measured cost of not having it: over 14 days, 1-3 audits a day arrived as
 * bare public IPs, each charged and then burning 130-207s through the capture
 * chain and retry ladder before refunding.
 */

test("bare IPv4 hosts are recognised", () => {
  for (const url of [
    "https://61.45.236.192",
    "https://49.248.161.6/",
    "http://53.113.91.101:8080/shop",
    "https://14.34.49.229/products/thing",
  ]) {
    assert.equal(isBareIpHost(url), true, url);
  }
});

test("bare IPv6 hosts are recognised", () => {
  assert.equal(isBareIpHost("https://[2606:4700:4700::1111]"), true);
  assert.equal(isBareIpHost("http://[2001:db8::1]/shop"), true);
});

test("real store domains are never flagged", () => {
  for (const url of [
    "https://allbirds.com",
    "https://www.brilliantearth.com/products/ring",
    "https://shop.example.co.uk/collections/all",
    "https://192-168-1-1.nip.io", // dashes, not dots — a hostname
    "https://store4.com",
  ]) {
    assert.equal(isBareIpHost(url), false, url);
  }
});

test("malformed input is not an IP, and never throws", () => {
  assert.equal(isBareIpHost(""), false);
  assert.equal(isBareIpHost("not a url"), false);
  assert.equal(isBareIpHost("61.45.236.192"), false); // no scheme → unparseable
});

test("the SSRF guard still owns private ranges — this rule doesn't duplicate it", () => {
  // If these ever start passing url-guard, that is a security regression and
  // this product rule is NOT the thing that should be catching them.
  for (const url of ["http://127.0.0.1", "http://10.0.0.5", "http://192.168.1.10"]) {
    assert.equal(validatePublicStoreUrl(url).ok, false, url);
  }
});

test("a public IP passes the security guard and is stopped by THIS rule", () => {
  // The exact division of labour, pinned: safe to fetch, still not a store.
  const guard = validatePublicStoreUrl("https://61.45.236.192");
  assert.equal(guard.ok, true, "a public IP is not an SSRF risk");
  assert.equal(isBareIpHost(guard.ok ? guard.url : ""), true);
});
