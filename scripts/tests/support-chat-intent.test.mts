import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { translator } from "../../lib/i18n/messages";

/**
 * The support chat's "talk to a human / the founder" intent (brief §3.4) is
 * answered WITHOUT the model — it must route to the contact form + Instagram
 * even if the AI is down. This proves the control flow: an owner-intent question
 * never reaches getProvider, while an ordinary answerable question does.
 *
 * ai/provider, usage/context and supabase/server are mocked.
 */

const dir = import.meta.dirname;
const providerUrl = pathToFileURL(resolve(dir, "../../ai/provider.ts")).href;
const meterUrl = pathToFileURL(resolve(dir, "../../lib/usage/context.ts")).href;
const supaUrl = pathToFileURL(resolve(dir, "../../lib/supabase/server.ts")).href;

let getProviderCalls = 0;

mock.module(providerUrl, {
  exports: {
    isAIConfigured: () => true,
    getProvider: async () => {
      getProviderCalls++;
      return {
        name: "fake",
        generateStructured: async () => ({ answer: "A grounded answer.", answered: true }),
      };
    },
  },
});

mock.module(meterUrl, { exports: { enterMeter: () => {} } });

mock.module(supaUrl, {
  exports: {
    createSupabaseServiceClient: () => ({
      from: () => ({ insert: async () => ({ error: null }) }),
    }),
  },
});

// getT() reads next/headers (a request scope the test doesn't have) — answer in English.
const i18nUrl = pathToFileURL(resolve(import.meta.dirname, "../../lib/i18n/server.ts")).href;
mock.module(i18nUrl, {
  exports: {
    getLocale: async () => "en",
    getT: async () => ({ locale: "en", t: translator("en") }),
  },
});

const { POST } = await import("../../app/api/support/chat/route");

function ask(question: string): Request {
  return new Request("http://localhost/api/support/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify({ question }),
  });
}

async function post(question: string): Promise<{ answer: string; answered: boolean }> {
  // The route types the arg as NextRequest, but at runtime uses only
  // .headers.get and .json(), which a standard Request provides.
  const res = await POST(ask(question) as never);
  return (await res.json()) as { answer: string; answered: boolean };
}

test("an owner/human intent is answered WITHOUT calling the model", async () => {
  getProviderCalls = 0;
  const out = await post("I want to talk to the owner");
  assert.equal(getProviderCalls, 0, "getProvider must NOT be called for this intent");
  assert.equal(out.answered, true);
  assert.match(out.answer, /\/support\/contact/);
  assert.match(out.answer, /elite_vault_team/);
});

test("the Spanish variant is also short-circuited and answered in Spanish", async () => {
  getProviderCalls = 0;
  const out = await post("quiero hablar con el fundador");
  assert.equal(getProviderCalls, 0);
  assert.match(out.answer, /fundador/);
  assert.match(out.answer, /\/support\/contact/);
});

test("an ordinary answerable question DOES reach the model", async () => {
  getProviderCalls = 0;
  const out = await post("How much does the Pro plan cost per month?");
  assert.equal(getProviderCalls, 1, "a normal KB-matched question is answered by the model");
  assert.equal(out.answered, true);
});
