"use client";

import { useActionState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import {
  submitSupportRequest,
  type SupportResult,
} from "@/app/actions/support";

const TOPICS = ["Billing", "Account", "Using the product", "Privacy & data", "Other"];

export function ContactForm() {
  const [state, action, pending] = useActionState<SupportResult | null, FormData>(
    submitSupportRequest,
    null,
  );

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-success/25 bg-success/[0.04] p-6 text-center">
        <CheckCircle2 className="mx-auto size-7 text-success" />
        <p className="mt-3 font-medium text-white">Message sent</p>
        <p className="mt-1 text-sm text-white/55">
          Thanks — we&apos;ll get back to you by email as soon as we can.
        </p>
      </div>
    );
  }

  const field =
    "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-champagne-400/40";

  return (
    <form action={action} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-xs text-white/50 mb-1.5">
            Your name
          </label>
          <input id="name" name="name" required maxLength={120} className={field} />
        </div>
        <div>
          <label htmlFor="email" className="block text-xs text-white/50 mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@yourstore.com"
            className={field}
          />
        </div>
      </div>

      <div>
        <label htmlFor="topic" className="block text-xs text-white/50 mb-1.5">
          Topic
        </label>
        <select id="topic" name="topic" className={field} defaultValue="">
          <option value="" disabled>
            Choose a topic…
          </option>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-xs text-white/50 mb-1.5">
          How can we help?
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          className={field}
        />
      </div>

      {state && !state.ok && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-5 py-2.5 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 transition-colors disabled:opacity-50"
      >
        <Send className="size-4" />
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
