"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Lock, Mail, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
  type AuthState,
} from "@/app/actions/auth";

/**
 * Auth form — v3.8 layout.
 *
 * Two modes the user can toggle between:
 *   1. MAGIC LINK (default, low-friction) — type email, click button,
 *      receive a one-tap link in your inbox. No password ever. Works
 *      identically for new and returning users.
 *   2. PASSWORD (toggle) — classic email + password, kept for users
 *      who prefer it or who have weak email access.
 *
 * Google OAuth was removed in v3.8 — it added Supabase-domain UI noise
 * to the OAuth consent screen, required Google Cloud project setup, and
 * had higher fail rate than magic links. Magic link is the "automatic"
 * alternative the user asked for: a single email field, click submit,
 * check inbox, done.
 */
async function saveCredentialIfPossible(email: string, password: string) {
  if (typeof window === "undefined") return;
  const PC = (
    window as unknown as { PasswordCredential?: typeof PasswordCredential }
  ).PasswordCredential;
  if (!PC || !navigator.credentials?.store) return;
  try {
    const cred = new PC({ id: email, password, name: email });
    await navigator.credentials.store(cred);
  } catch {
    // Non-fatal — user dismissed or browser doesn't support it.
  }
}

type AuthMethod = "magic" | "password";

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
  // Magic link is the default — most users want one-click. Password mode
  // is a toggle for those who prefer the classic flow.
  const [method, setMethod] = useState<AuthMethod>("magic");

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
            {method === "magic"
              ? "Sign in with a one-tap email link"
              : "Sign in with your password"}
          </p>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {message}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {method === "magic" ? (
          <MagicLinkForm key="magic" nextUrl={nextUrl} />
        ) : (
          <PasswordForm
            key="password"
            mode={mode}
            nextUrl={nextUrl}
            router={router}
          />
        )}
      </AnimatePresence>

      {/* Method toggle */}
      <div className="mt-5 pt-5 border-t border-white/[0.06] text-center">
        {method === "magic" ? (
          <button
            onClick={() => setMethod("password")}
            className="text-xs text-white/45 hover:text-white/80 transition-colors"
          >
            Prefer a password? <span className="text-champagne-400">Use email + password →</span>
          </button>
        ) : (
          <button
            onClick={() => setMethod("magic")}
            className="text-xs text-white/45 hover:text-white/80 transition-colors"
          >
            <span className="text-champagne-400">← Back to one-tap email link</span>
          </button>
        )}
      </div>

      <p className="mt-5 text-center text-xs text-white/40">
        {mode === "sign-in" ? (
          <>
            Don&apos;t have an account?{" "}
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

// ─── Magic link sub-form ──────────────────────────────────────────────────

/**
 * Maps an email's domain to its webmail inbox so we can offer a one-tap
 * "Open your inbox" button on the "check your email" screen. We link to the
 * inbox ROOT (not a fragile sender-search deep link) so it always lands
 * somewhere useful. Unknown/custom domains return null and we simply don't
 * show the button — the on-screen instructions still cover them.
 */
const INBOX_PROVIDERS: { domains: string[]; url: string; label: string }[] = [
  {
    domains: ["gmail.com", "googlemail.com"],
    url: "https://mail.google.com/mail/u/0/",
    label: "Gmail",
  },
  {
    domains: [
      "outlook.com",
      "outlook.es",
      "hotmail.com",
      "hotmail.es",
      "hotmail.co.uk",
      "live.com",
      "live.com.mx",
      "msn.com",
    ],
    url: "https://outlook.live.com/mail/0/",
    label: "Outlook",
  },
  {
    domains: ["yahoo.com", "yahoo.es", "ymail.com", "rocketmail.com"],
    url: "https://mail.yahoo.com/",
    label: "Yahoo Mail",
  },
  {
    domains: ["icloud.com", "me.com", "mac.com"],
    url: "https://www.icloud.com/mail",
    label: "iCloud Mail",
  },
  {
    domains: ["proton.me", "protonmail.com", "pm.me"],
    url: "https://mail.proton.me/u/0/",
    label: "Proton Mail",
  },
  { domains: ["aol.com"], url: "https://mail.aol.com/", label: "AOL Mail" },
  { domains: ["zoho.com"], url: "https://mail.zoho.com/", label: "Zoho Mail" },
  {
    domains: ["gmx.com", "gmx.net", "gmx.es"],
    url: "https://www.gmx.com/",
    label: "GMX",
  },
];

function inboxLinkFor(email: string): { url: string; label: string } | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return null;
  for (const p of INBOX_PROVIDERS) {
    if (p.domains.includes(domain)) return { url: p.url, label: p.label };
  }
  return null;
}

function MagicLinkForm({ nextUrl }: { nextUrl: string }) {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    sendMagicLink,
    { status: "idle" },
  );
  // Controlled so we still have the address on the success screen (to build
  // the "open your inbox" link).
  const [email, setEmail] = useState("");

  // After success, show a friendly "check your email" state instead of
  // the form. The user shouldn't be able to keep submitting once a link
  // is already on its way.
  if (state.status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="rounded-xl border border-success/25 bg-success/[0.04] p-5 text-center"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 ring-1 ring-success/25">
          <CheckCircle2 className="size-6 text-success" />
        </div>
        <p className="mt-3 font-medium text-white">Check your email</p>
        <p className="mt-1 text-sm text-white/55 leading-relaxed">
          We sent you a one-tap sign-in link. It can take a few seconds to
          arrive — if your inbox looks empty, give it a moment and refresh.
        </p>

        {/* One-tap shortcut straight to the user's inbox (known providers). */}
        {(() => {
          const inbox = inboxLinkFor(email);
          if (!inbox) return null;
          return (
            <Button asChild size="lg" className="mt-4 w-full">
              <a href={inbox.url} target="_blank" rel="noopener noreferrer">
                Open {inbox.label}
                <ArrowRight className="size-4" />
              </a>
            </Button>
          );
        })()}

        <p className="mt-4 text-[11px] text-white/35">
          Didn&apos;t get it? Check spam, or wait 60 seconds and try again.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      action={formAction}
      method="post"
      className="space-y-4"
    >
      <input type="hidden" name="next" value={nextUrl} />

      <div className="space-y-1.5">
        <Label htmlFor="magic-email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30 pointer-events-none" />
          <Input
            id="magic-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourstore.com"
            required
            className="pl-10"
            disabled={isPending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Sending link…" : "Email me a sign-in link"}
        {!isPending && <ArrowRight className="size-4" />}
      </Button>

      {state.status === "error" && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}

      <p className="text-[11px] text-white/35 text-center leading-relaxed">
        No password to remember. Same link works for sign-up and sign-in.
      </p>
    </motion.form>
  );
}

// ─── Password sub-form (kept for users who prefer it) ─────────────────────

function PasswordForm({
  mode,
  nextUrl,
  router,
}: {
  mode: "sign-in" | "sign-up";
  nextUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: any;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = mode === "sign-up" ? signUpWithPassword : signInWithPassword;
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    action,
    { status: "idle" },
  );

  useEffect(() => {
    if (state.status !== "success" || !state.redirectTo) return;
    const fd = new FormData(formRef.current ?? undefined);
    const email = String(fd.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(fd.get("password") ?? "");
    if (email && password) {
      void saveCredentialIfPossible(email, password);
    }
    const t = setTimeout(() => {
      router.replace(state.redirectTo!);
      router.refresh();
    }, 80);
    return () => clearTimeout(t);
  }, [state, router]);

  return (
    <motion.form
      ref={formRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      action={formAction}
      method="post"
      className="space-y-4"
    >
      <input type="hidden" name="next" value={nextUrl} />

      <div className="space-y-1.5">
        <Label htmlFor="pw-email">Email</Label>
        <Input
          id="pw-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@yourstore.com"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pw-password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30 pointer-events-none" />
          <Input
            id="pw-password"
            name="password"
            type="password"
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            placeholder={
              mode === "sign-up" ? "At least 8 characters" : "Your password"
            }
            required
            minLength={8}
            className="pl-10"
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
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
    </motion.form>
  );
}
