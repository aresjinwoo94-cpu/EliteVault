import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_RESET_DEFAULT_ISO,
  applyReset,
  clampToReset,
  resolveResetAt,
} from "../../lib/admin/reset-core";

const DEFAULT_MS = Date.parse(CODE_RESET_DEFAULT_ISO);

test("DB value wins over the code default and the env fallback", () => {
  const ms = resolveResetAt({ db: "2026-10-09T15:00:00Z", env: "2026-01-01T00:00:00Z" });
  assert.equal(ms, Date.parse("2026-10-09T15:00:00Z"));
});

test("no DB value → the code default (deploy date), not the env var", () => {
  assert.equal(resolveResetAt({ db: null, env: "2026-01-01T00:00:00Z" }), DEFAULT_MS);
  assert.equal(resolveResetAt({}), DEFAULT_MS);
});

test("an unparseable DB value is ignored", () => {
  assert.equal(resolveResetAt({ db: "garbage" }), DEFAULT_MS);
});

test("the code default is Oct 2026, Guayaquil midnight", () => {
  assert.equal(CODE_RESET_DEFAULT_ISO, "2026-10-07T05:00:00.000Z");
});

test("clampToReset never lets a window start before the reset", () => {
  assert.equal(clampToReset(100, 500), 500);
  assert.equal(clampToReset(900, 500), 900);
});

test("applyReset stores now() and does not purge unless asked", async () => {
  const calls: string[] = [];
  const now = Date.parse("2026-10-10T12:00:00Z");
  const r = await applyReset(
    {
      now: () => now,
      saveResetAt: async (iso) => void calls.push("save:" + iso),
      purgeTraffic: async (iso) => void calls.push("purge:" + iso),
    },
    { purgeTraffic: false },
  );
  assert.deepEqual(calls, ["save:2026-10-10T12:00:00.000Z"]);
  assert.equal(r.resetAt, "2026-10-10T12:00:00.000Z");
  assert.equal(r.purged, false);
});

test("applyReset with purgeTraffic purges rows older than the reset, after saving", async () => {
  const calls: string[] = [];
  const r = await applyReset(
    {
      now: () => Date.parse("2026-10-10T12:00:00Z"),
      saveResetAt: async (iso) => void calls.push("save:" + iso),
      purgeTraffic: async (iso) => void calls.push("purge:" + iso),
    },
    { purgeTraffic: true },
  );
  assert.deepEqual(calls, ["save:2026-10-10T12:00:00.000Z", "purge:2026-10-10T12:00:00.000Z"]);
  assert.equal(r.purged, true);
});

test("a failed purge does not undo the reset and is reported", async () => {
  const r = await applyReset(
    {
      now: () => Date.parse("2026-10-10T12:00:00Z"),
      saveResetAt: async () => {},
      purgeTraffic: async () => {
        throw new Error("boom");
      },
    },
    { purgeTraffic: true },
  );
  assert.equal(r.purged, false);
  assert.equal(r.purgeError, "boom");
});
