"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  type AuthState,
} from "@/app/actions/auth";

/**
 * Explicitly tell the browser to save the credential after a successful
 * login. Because we use Server Actions (the form isn't submitted the
 * "classic" way), browsers' built-in password-save heuristic often misses
 * the event. The Credential Management API is the supported, modern way
 * to prompt for save.
 *
 *   https://developer.mozilla.org/en-US/docs/Web/API/Credential_Management_API
 */
async function saveCredentialIfPossible(email: string, password: string) {
  // Feature detect — Safari < 18 and some embedded webviews lack it.
  if (typeof window === "undefined") return;
  const PC = (window as unknown as { PasswordCredential?: typeof PasswordCredential })
    .PasswordCredential;
  if (!PC || !navigator.credentials?.store) return;
  try {
    const cred = new PC({ id: email, password, name: email });
    await navigator.credentials.store(cred);
  } catch {
    // Non-fatal — user dismissed or browser doesn't support it.
  }
}

export function AuthForm({
  mode,
  nextUrl,
  message,
}: {
  mode: "sign-in" | "sign-up";
  nextUrl: string;
  message?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const action = mode === "sign-up" ? signUpWithPassword : signInWithPassword;
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    action,
    { status: "idle" },
  );

  // On success, save credentials + redirect.
  useEffect(() => {
    if (state.status !== "success" || !state.redirectTo) return;
    const fd = new FormData(formRef.current ?? undefined);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    if (email && password) {
      void saveCredentialIfPossible(email, password);
    }
    // Small defer so the credential prompt has a tick to fire before
    // the page navigates away.
    const t = setTimeout(() => {
      router.replace(state.redirectTo!);
      router.refresh();
    }, 80);
    return () => clearTimeout(t);
  }, [state, router]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong rounded-2xl p-8 shadow-card"
    >
      <div className="mb-6 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-champagne-400/10 ring-1 ring-champagne-400/20">
          <Sparkles className="size-4 text-champagne-400" />
        </div>
        <div>
          <h1 className="text-xl font-medium tracking-tight">
            {mode === "sign-in" ? "Welcome back" : "Create your vault"}
          </h1>
          <p className="text-sm text-white/50">
            {mode === "sign-in"
              ? "Sign in to your EliteVault account"
              : "Find out exactly what makes stores convert"}
          </p>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {message}
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        method="post"
        className="space-y-4"
      >
        <input type="hidden" name="next" value={nextUrl} />

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourstore.com"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30 pointer-events-none" />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              placeholder={mode === "sign-up" ? "At least 8 characters" : "Your password"}
              required
              minLength={8}
              className="pl-10"
            />
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isPending}
        >
          {isPending
            ? mode === "sign-up"
              ? "Creating account…"
              : "Signing in…"
            : mode === "sign-up"
              ? "Create account"
              : "Sign in"}
          {!isPending && <ArrowRight className="size-4" />}
        </Button>

        {state.status === "error" && (
          <p className="text-xs text-destructive">{state.message}</p>
        )}
      </form>

      {process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true" && (
        <>
          <div className="my-5 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[10px] uppercase tracking-widest text-white/30">
              or
            </span>
            <Separator className="flex-1" />
          </div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={nextUrl} />
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              className="w-full"
            >
              <GoogleIcon className="size-4" />
              Continue with Google
            </Button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-xs text-white/40">
        {mode === "sign-in" ? (
          <>
            Don't have an account?{" "}
            <Link
              href="/sign-up"
              className="text-champagne-400 hover:text-champagne-300 transition-colors"
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="text-champagne-400 hover:text-champagne-300 transition-colors"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </motion.div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M21.8 10.2H12v3.8h5.6c-.5 2.5-2.7 4-5.6 4-3.4 0-6.1-2.7-6.1-6.1S8.6 5.8 12 5.8c1.5 0 2.9.5 4 1.5l2.7-2.7C16.9 2.9 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.3-.2-2z"
      />
      <path
        fill="#FF3D00"
        d="M3.2 7.3l3.1 2.3C7.2 7.7 9.4 6.2 12 6.2c1.5 0 2.9.5 4 1.5l2.7-2.7C16.9 3.3 14.6 2.4 12 2.4 8 2.4 4.5 4.4 3.2 7.3z"
      />
      <path
        fill="#4CAF50"
        d="M12 22c2.6 0 5-1 6.7-2.5l-3.1-2.5c-.9.6-2 1-3.6 1-2.9 0-5.3-1.9-6.2-4.5l-3 2.3C4.2 19.8 7.8 22 12 22z"
      />
      <path
        fill="#1976D2"
        d="M21.8 10.2H12v3.8h5.6c-.3 1.3-1 2.4-2 3.2l3.1 2.5c1.7-1.6 2.7-3.9 2.7-6.5 0-.7-.1-1.3-.2-2z"
      />
    </svg>
  );
}
