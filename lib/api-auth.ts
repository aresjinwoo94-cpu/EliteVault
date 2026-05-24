import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";

/**
 * Bearer-token auth for the public REST API.
 *
 * Header format: `Authorization: Bearer ev_live_<32-char-hex>`
 *
 * We store SHA-256 of the token in `api_keys.token_hash` (with a UNIQUE
 * index). On every request we hash the incoming token and look it up.
 * Successful auth bumps `last_used_at` + `request_count` (best-effort).
 */

const TOKEN_PREFIX = "ev_live_";

export interface AuthedRequest {
  userId: string;
  plan: PlanTier;
  apiKeyId: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString("hex"); // 48 chars
  const plaintext = `${TOKEN_PREFIX}${raw}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 16) + "…", // for display, never the full thing
    hash: sha256(plaintext),
  };
}

/**
 * Validates the Authorization header. Returns either the auth context or
 * a NextResponse to short-circuit the route with the right error code.
 */
export async function requireApiKey(
  req: Request,
): Promise<AuthedRequest | NextResponse> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json(
      { error: "missing_bearer_token", hint: "Authorization: Bearer ev_live_…" },
      { status: 401 },
    );
  }
  const token = auth.slice(7).trim();
  if (!token.startsWith(TOKEN_PREFIX)) {
    return NextResponse.json(
      { error: "invalid_token_format" },
      { status: 401 },
    );
  }

  const service = createSupabaseServiceClient();
  const hash = sha256(token);
  const { data: key } = await service
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!key || key.revoked_at) {
    return NextResponse.json(
      { error: "invalid_or_revoked_token" },
      { status: 401 },
    );
  }

  const { data: profile } = await service
    .from("profiles")
    .select("plan, credits")
    .eq("id", key.user_id)
    .single();
  if (!profile || !PLANS[profile.plan].unlocksScale) {
    return NextResponse.json(
      {
        error: "scale_plan_required",
        detail:
          "Your plan does not include API access. Upgrade to Scale at /app/billing.",
      },
      { status: 403 },
    );
  }

  // Fire-and-forget usage update
  service
    .from("api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      request_count: (await currentCount(service, key.id)) + 1,
    })
    .eq("id", key.id)
    .then(() => {});

  return { userId: key.user_id, plan: profile.plan, apiKeyId: key.id };
}

async function currentCount(
  service: ReturnType<typeof createSupabaseServiceClient>,
  keyId: string,
): Promise<number> {
  const { data } = await service
    .from("api_keys")
    .select("request_count")
    .eq("id", keyId)
    .single();
  return data?.request_count ?? 0;
}
