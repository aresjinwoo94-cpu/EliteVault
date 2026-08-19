import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKeys } from "../../ai/providers/gemini";

/**
 * The key pool only multiplies quota when each key is a DIFFERENT key in a
 * DIFFERENT Google project — the free tier's 15 RPM is enforced per project,
 * not per key.
 *
 * A redundant key is not merely useless, it is expensive: rotation treats it as
 * another chance, so it spends a real API round-trip getting the same 429,
 * inside the step budget the vision call needs. These pin the one class of
 * redundancy the code CAN detect on its own.
 */

test("a key pasted into two slots counts once", () => {
  assert.deepEqual(dedupeKeys(["AIza-one", "AIza-two", "AIza-one"]), [
    "AIza-one",
    "AIza-two",
  ]);
});

test("rotation order is preserved — the primary key stays first", () => {
  // loadKeys() puts GEMINI_API_KEY first and the numbered slots after it, and
  // the round-robin cursor starts at 0. Reordering here would silently change
  // which key serves the first request of every cold lambda.
  assert.deepEqual(dedupeKeys(["primary", "second", "third"]), [
    "primary",
    "second",
    "third",
  ]);
});

test("whitespace around a pasted key doesn't create a phantom duplicate", () => {
  // Copy-pasting into a dashboard field is exactly how a trailing newline or
  // space gets in, and an untrimmed copy would otherwise look like a distinct
  // key and earn its own wasted rotation attempt.
  assert.deepEqual(dedupeKeys(["AIza-one", " AIza-one", "AIza-one\n"]), ["AIza-one"]);
});

test("empty and whitespace-only slots are dropped, not rotated into", () => {
  // An env var defined but left blank must not become a pool entry — it would
  // fail with an auth error rather than a 429, which isn't retryable.
  assert.deepEqual(dedupeKeys(["AIza-one", "", "   ", "AIza-two"]), [
    "AIza-one",
    "AIza-two",
  ]);
});

test("an empty pool stays empty rather than becoming a blank key", () => {
  assert.deepEqual(dedupeKeys([]), []);
  assert.deepEqual(dedupeKeys(["", "  "]), []);
});

test("genuinely distinct keys are all kept", () => {
  // The good configuration: one key per project. Nothing here may be dropped.
  const keys = ["proj-a", "proj-b", "proj-c", "proj-d", "proj-e", "proj-f"];
  assert.deepEqual(dedupeKeys(keys), keys);
});
