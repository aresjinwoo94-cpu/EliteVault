import { test } from "node:test";
import assert from "node:assert/strict";
import { isThinkingConfigError, is429, is503 } from "../../ai/providers/gemini";

/**
 * Regression: real audits were refunding with "took longer to audit than one
 * run allows". Production usage_events showed why —
 * `totalTokenCount` exceeded `promptTokenCount + candidatesTokenCount` by 357,
 * 1158 and 2120 tokens on consecutive runs. That gap is thinking, nothing ever
 * set `thinkingConfig`, and thinking tokens generate at output speed. Thousands
 * of them don't fit in the 50s step budget.
 *
 * The budget is now bounded and env-tunable. These lock the safety valve: a
 * model that refuses the config must cost one retry, never an audit.
 */

test("a model refusing the thinking budget is recognised", () => {
  assert.equal(
    isThinkingConfigError("Invalid value for thinkingConfig.thinkingBudget"),
    true,
  );
  assert.equal(
    isThinkingConfigError("thinking is not supported for this model"),
    true,
  );
  assert.equal(
    isThinkingConfigError("400 Unknown field: thinking_config"),
    true,
  );
  assert.equal(
    isThinkingConfigError("thinking cannot be disabled on this model"),
    true,
  );
});

test("real failures are NOT mistaken for a thinking-config problem", () => {
  // Misclassifying any of these would silently drop the thinking budget and,
  // worse, swallow a genuine error into a pointless same-key retry.
  assert.equal(isThinkingConfigError("RESOURCE_EXHAUSTED: quota exceeded"), false);
  assert.equal(isThinkingConfigError('{"code": 503, "status": "UNAVAILABLE"}'), false);
  assert.equal(isThinkingConfigError("Gemini: empty response"), false);
  assert.equal(isThinkingConfigError("model is currently overloaded"), false);
  assert.equal(isThinkingConfigError(""), false);
});

test("the word 'thinking' alone is not enough to classify an error", () => {
  // A model that merely mentions thinking while failing for another reason
  // must not disable the budget for the rest of the lambda.
  assert.equal(isThinkingConfigError("the model is thinking about your request"), false);
});

test("the three error classifiers stay disjoint on real messages", () => {
  // They're checked in sequence in the same catch block, so an overlap would
  // route a failure down the wrong recovery path.
  const quota = "429 RESOURCE_EXHAUSTED: quota exceeded for this key";
  const overload = '{"code": 503, "message": "model is currently overloaded"}';
  const thinking = "Invalid value at thinkingConfig.thinkingBudget: unsupported";

  assert.equal(is429(quota), true);
  assert.equal(is503(quota), false);
  assert.equal(isThinkingConfigError(quota), false);

  assert.equal(is503(overload), true);
  assert.equal(isThinkingConfigError(overload), false);

  assert.equal(isThinkingConfigError(thinking), true);
  assert.equal(is429(thinking), false);
  assert.equal(is503(thinking), false);
});
