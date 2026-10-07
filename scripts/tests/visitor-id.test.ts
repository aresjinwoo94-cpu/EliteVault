import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVisitorId, VISITOR_COOKIE } from "../../lib/analytics/visitor-id";

const UUID = "3f2b8c1e-9a4d-4e57-8b21-0c6d5e7f1a90";

test("the tracker has its own cookie, distinct from the anonymous-audit ev_anon", () => {
  assert.equal(VISITOR_COOKIE, "ev_vid");
});

test("ev_vid wins", () => {
  assert.deepEqual(resolveVisitorId({ vid: UUID, legacy: "other" }), { id: UUID, fromLegacy: false });
});

test("a legacy plain-UUID ev_anon is adopted so existing visitors keep their identity", () => {
  assert.deepEqual(resolveVisitorId({ legacy: UUID }), { id: UUID, fromLegacy: true });
});

test("the anonymous-audit cookie (token.signature) is NEVER used as a visitor id", () => {
  assert.equal(resolveVisitorId({ legacy: "Zm9vYmFy.c2lnbmF0dXJl" }), null);
  assert.equal(resolveVisitorId({}), null);
});
