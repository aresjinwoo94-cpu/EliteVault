import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * The contact-form action's durability contract (brief §3.3):
 *   • the message is STORED before the email is attempted, so a Resend failure
 *     never loses it and the caller still sees success;
 *   • only a TOTAL failure (neither stored nor emailed) returns ok:false;
 *   • a successful send flips email_sent on the stored row;
 *   • the owner (SUPPORT_NOTIFY_EMAIL) and the support inbox are both notified,
 *     with the sender as reply-to.
 *
 * The email + supabase modules are mocked; each test swaps their behaviour.
 */

const resendUrl = pathToFileURL(resolve(import.meta.dirname, "../../lib/email/resend.ts")).href;
const supaUrl = pathToFileURL(resolve(import.meta.dirname, "../../lib/supabase/server.ts")).href;

type SendResult = { ok: boolean; id?: string; error?: string };
let sendResult: SendResult = { ok: true, id: "e1" };
let sendCalls: { to: string | string[]; replyTo?: string }[] = [];

let insertShouldThrow = false;
let inserted: Record<string, unknown>[] = [];
let updated: { patch: Record<string, unknown>; id: unknown }[] = [];

mock.module(resendUrl, {
  exports: {
    sendEmail: async (opts: { to: string | string[]; replyTo?: string }) => {
      sendCalls.push({ to: opts.to, replyTo: opts.replyTo });
      return sendResult;
    },
  },
});

mock.module(supaUrl, {
  exports: {
    createSupabaseServiceClient: () => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          if (insertShouldThrow) {
            return {
              select: () => ({
                single: async () => ({ data: null, error: new Error("db down") }),
              }),
            };
          }
          inserted.push(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: "row-1" }, error: null }),
            }),
          };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: unknown) => {
            updated.push({ patch, id });
            return { error: null };
          },
        }),
      }),
    }),
  },
});

const { submitSupportRequest } = await import("../../app/actions/support");

function fd(over: Partial<Record<string, string>> = {}): FormData {
  const f = new FormData();
  f.set("name", over.name ?? "Jane Doe");
  f.set("email", over.email ?? "jane@example.com");
  if (over.topic !== undefined) f.set("topic", over.topic);
  else f.set("topic", "Billing");
  f.set("message", over.message ?? "I have a question about my plan and billing.");
  return f;
}

function reset() {
  sendResult = { ok: true, id: "e1" };
  sendCalls = [];
  insertShouldThrow = false;
  inserted = [];
  updated = [];
}

test("stored + emailed: ok:true and email_sent flipped", async () => {
  reset();
  process.env.SUPPORT_NOTIFY_EMAIL = "owner@example.com";
  const res = await submitSupportRequest(null, fd());
  assert.deepEqual(res, { ok: true });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].email_sent, false, "stored first with email_sent=false");
  assert.equal(updated.length, 1, "email_sent flipped after a successful send");
  assert.deepEqual(updated[0].patch, { email_sent: true });
  // Both the owner and the support inbox are notified, sender as reply-to.
  assert.deepEqual(sendCalls[0].to, ["owner@example.com", "support@elitevaultapp.com"]);
  assert.equal(sendCalls[0].replyTo, "jane@example.com");
});

test("email fails but store succeeds: still ok:true, row kept, no flip", async () => {
  reset();
  sendResult = { ok: false, error: "http_500" };
  const res = await submitSupportRequest(null, fd());
  assert.deepEqual(res, { ok: true }, "a Resend outage must not lose the message");
  assert.equal(inserted.length, 1, "the message is stored");
  assert.equal(updated.length, 0, "email_sent is not flipped on a failed send");
});

test("neither stored nor emailed: ok:false with an honest message", async () => {
  reset();
  insertShouldThrow = true;
  sendResult = { ok: false, error: "not_configured" };
  const res = await submitSupportRequest(null, fd());
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /support@elitevaultapp\.com/);
    assert.match(res.error, /elite_vault_team/);
  }
});

test("without SUPPORT_NOTIFY_EMAIL, only the support inbox is notified", async () => {
  reset();
  delete process.env.SUPPORT_NOTIFY_EMAIL;
  await submitSupportRequest(null, fd());
  assert.deepEqual(sendCalls[0].to, ["support@elitevaultapp.com"]);
});

test("invalid input is rejected before any store or send", async () => {
  reset();
  const res = await submitSupportRequest(null, fd({ message: "too short" }));
  assert.equal(res.ok, false);
  assert.equal(inserted.length, 0);
  assert.equal(sendCalls.length, 0);
});
