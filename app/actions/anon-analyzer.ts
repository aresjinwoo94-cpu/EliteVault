"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { validatePublicStoreUrl } from "@/lib/security/url-guard";
import { isBareIpHost, BARE_IP_REASON } from "@/lib/analyzer/store-url-policy";
import { getOrCreateAnonToken } from "@/lib/anon/session";
import { checkAnonAuditRate } from "@/lib/anon/rate-limit";

/**
 * Anonymous audit (activation-funnel Tarea 1).
 *
 * Lets cold traffic run ONE real audit from the landing with no account, then
 * see the "aha" (score + annotated screenshot) and sign up to keep it. It
 * reuses the EXACT same scoring engine as the logged-in flow — the same
 * `analysis/requested` Inngest pipeline — so there is zero duplicated AI logic.
 * The only differences: the row has no owner yet (user_id null + anon_id set),
 * no credit is charged, and the result view is gated.
 *
 * Guardrails (each anonymous audit is an unattributed AI cost):
 *   • SSRF-safe URL validation (no localhost / private IPs / weird schemes).
 *   • Per-IP-per-day rate limit (ANON_AUDIT_LIMIT_PER_DAY, default 1).
 */

export type CreateAnonAnalysisResult =
  | { ok: true; id: string }
  | { ok: false; error: string; limited?: boolean };

export async function createAnonAnalysis(input: {
  url: string;
}): Promise<CreateAnonAnalysisResult> {
  // 1) Validate the URL first — cheapest rejection, and it protects the fetch.
  const guard = validatePublicStoreUrl(input.url ?? "");
  if (!guard.ok) {
    return { ok: false, error: guard.reason };
  }
  // A PUBLIC bare IP clears the security guard but is never a storefront. The
  // anonymous path needs this most: it's the highest-volume entry point and the
  // one where a stranger pastes whatever they have.
  if (isBareIpHost(guard.url)) {
    return { ok: false, error: BARE_IP_REASON };
  }

  // 2) Anti-abuse: per-IP daily cap. Over the limit → a soft, honest message
  //    the UI turns into the "create an account for more" gate, not a raw error.
  const rate = await checkAnonAuditRate();
  if (!rate.allowed) {
    return {
      ok: false,
      limited: true,
      error:
        "You've used your free audit for today. Create a free account to run more — no card needed.",
    };
  }

  // 3) Bind this audit to the browser via the signed httpOnly session cookie,
  //    so only its creator can view it and we can re-parent it on sign-up.
  const anonToken = await getOrCreateAnonToken();

  const service = createSupabaseServiceClient();

  // 4) Create the unowned analysis row (user_id null). No credit accounting.
  const { data: row, error: insErr } = await service
    .from("analyses")
    .insert({
      user_id: null,
      url: guard.url,
      status: "queued",
      credits_charged: 0,
      anon_id: anonToken,
      anon_ip_hash: rate.ipHash,
    } as never)
    .select("id")
    .single();

  if (insErr || !row) {
    return {
      ok: false,
      error: insErr?.message ?? "Could not start your audit. Please try again.",
    };
  }

  const analysisId = (row as { id: string }).id;

  // 5) Kick the SAME pipeline as the logged-in flow. userId is null (anonymous);
  //    the pipeline skips the owner-only steps (credit refund, first-value email)
  //    for null userId. `fast: true` keeps the anon audit on the cheap model tier
  //    so its marginal cost stays in cents — exactly like a Free audit.
  await inngest.send({
    name: "analysis/requested",
    data: {
      analysisId,
      userId: null,
      anonId: anonToken,
      url: guard.url,
      plan: "free",
      fast: true,
    },
  });

  return { ok: true, id: analysisId };
}
