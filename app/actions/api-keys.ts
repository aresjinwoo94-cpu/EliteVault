"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";
import { generateApiKey } from "@/lib/api-auth";
import { getT } from "@/lib/i18n/server";

const CreateInput = z.object({ name: z.string().min(1).max(60) });

export type CreateApiKeyResult =
  | { ok: true; token: string; id: string; prefix: string }
  | { ok: false; error: string };

/**
 * Creates an API key. Returns the PLAINTEXT token exactly once —
 * subsequent reads only return the prefix for display.
 */
export async function createApiKey(
  input: z.infer<typeof CreateInput>,
): Promise<CreateApiKeyResult> {
  const { t } = await getT();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("actionErr.notSignedIn") };

  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("actionErr.invalidInput") };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  if (!profile || !PLANS[profile.plan].unlocksScale) {
    return {
      ok: false,
      error: t("actionErr.apiScale"),
    };
  }

  const { plaintext, prefix, hash } = generateApiKey();
  const { data: row, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      token_hash: hash,
      token_prefix: prefix,
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "Insert failed" };

  revalidatePath("/app/settings/api-keys");
  return { ok: true, token: plaintext, id: row.id, prefix };
}

export async function revokeApiKey(id: string) {
  const { t } = await getT();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("actionErr.notSignedIn") };

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/api-keys");
  return { ok: true };
}
