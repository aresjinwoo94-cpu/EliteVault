import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYZER_SYSTEM,
  buildAnalyzerUserMessage,
} from "../../ai/prompts";
import { SIGNAL_SOURCES } from "../../ai/schemas";

/**
 * Brief §2.1/§2.2 — score determinism is enforced by a FIXED rubric + few-shot
 * calibration anchors + a low temperature, not by luck. We can't call Gemini in
 * a unit test, so we lock the config that produces determinism: the anchors are
 * present, the consistency instruction stands, and the grounding block only
 * appears when it's supplied.
 */

test("§2.1 — the system prompt pins fixed calibration anchors", () => {
  assert.match(ANALYZER_SYSTEM, /Calibration anchors/i);
  // The hand-scored reference points must be present so the model anchors to a
  // fixed ruler rather than its mood.
  for (const anchor of ["~93", "~78", "~50", "~30", "~15"]) {
    assert.ok(
      ANALYZER_SYSTEM.includes(anchor),
      `missing calibration anchor ${anchor}`,
    );
  }
});

test("§2.1 — the consistency instruction survives", () => {
  assert.match(
    ANALYZER_SYSTEM,
    /same unchanged store must reach effectively the same verdict/i,
  );
  // The anchors, not a fresh angle, decide the number.
  assert.match(ANALYZER_SYSTEM, /the anchors decide the number/i);
});

test("§2.2 — signal sources are exactly real_signal vs ai_estimate", () => {
  assert.deepEqual([...SIGNAL_SOURCES], ["real_signal", "ai_estimate"]);
});

test("§2.3 — grounding block is injected only when supplied", () => {
  const withBlock = buildAnalyzerUserMessage({
    url: "https://example.com",
    groundingBlock: "# Niche grounding — SOFT PRIORS\n- Acme: 12 active ads",
  });
  assert.match(withBlock, /Niche grounding/);

  const withoutBlock = buildAnalyzerUserMessage({ url: "https://example.com" });
  assert.doesNotMatch(withoutBlock, /Niche grounding/);
});
