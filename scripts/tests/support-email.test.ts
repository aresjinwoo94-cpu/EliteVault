import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../../lib/email/resend";

/**
 * sendEmail's Resend payload — specifically the new optional reply_to used by
 * the contact form so the owner can reply to the sender with one click, and the
 * multi-recipient `to`. Global fetch is stubbed to capture the request body; no
 * real HTTP happens.
 */

const realFetch = globalThis.fetch;
const prevKey = process.env.RESEND_API_KEY;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (prevKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = prevKey;
});

function captureBody(): { get: () => Record<string, unknown> } {
  let body: Record<string, unknown> = {};
  process.env.RESEND_API_KEY = "re_test_key";
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    body = JSON.parse(init?.body ?? "{}");
    return {
      ok: true,
      json: async () => ({ id: "email_123" }),
      text: async () => "",
    };
  }) as unknown as typeof fetch;
  return { get: () => body };
}

test("reply_to is included when replyTo is passed", async () => {
  const cap = captureBody();
  const res = await sendEmail({
    to: "owner@example.com",
    subject: "s",
    html: "<p>h</p>",
    replyTo: "customer@example.com",
  });
  assert.equal(res.ok, true);
  assert.equal(cap.get().reply_to, "customer@example.com");
});

test("reply_to is omitted when replyTo is not passed", async () => {
  const cap = captureBody();
  await sendEmail({ to: "owner@example.com", subject: "s", html: "<p>h</p>" });
  assert.equal("reply_to" in cap.get(), false);
});

test("to accepts an array of recipients", async () => {
  const cap = captureBody();
  await sendEmail({
    to: ["owner@example.com", "support@example.com"],
    subject: "s",
    html: "<p>h</p>",
  });
  assert.deepEqual(cap.get().to, ["owner@example.com", "support@example.com"]);
});

test("without RESEND_API_KEY it no-ops rather than throwing", async () => {
  delete process.env.RESEND_API_KEY;
  const res = await sendEmail({ to: "x@example.com", subject: "s", html: "h" });
  assert.equal(res.ok, false);
  assert.equal(res.error, "not_configured");
});
