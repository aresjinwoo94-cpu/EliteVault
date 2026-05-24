"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const Update = z.object({
  full_name: z.string().min(1).max(120).optional(),
});

export async function updateProfile(
  input: z.infer<typeof Update>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Update.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings");
  return { ok: true };
}
