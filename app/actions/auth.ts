"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = {
  status: "idle" | "success" | "error";
  message?: string;
  redirectTo?: string;
};

/**
 * Email + password auth.
 *
 * For new accounts we call signUp; for existing we call signInWithPassword.
 * The Supabase project must have "Confirm email" disabled (Auth → Providers
 * → Email → toggle off) so signUp returns a session immediately and the
 * user doesn't have to click a verification link.
 */
export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/app");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Please enter a valid email." };
  }
  if (password.length < 8) {
    return { status: "error", message: "Password must be at least 8 characters." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "success", message: "Account created", redirectTo: next };
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/app");

  if (!email || !password) {
    return { status: "error", message: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "success", message: "Signed in", redirectTo: next };
}

/** Kept for compatibility — if Google OAuth gets enabled later. */
export async function signInWithGoogle(formData: FormData) {
  const next = String(formData.get("next") ?? "/app");
  const supabase = await createSupabaseServerClient();
  const { headers } = await import("next/headers");
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL!;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) throw error;
  if (data.url) redirect(data.url);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
