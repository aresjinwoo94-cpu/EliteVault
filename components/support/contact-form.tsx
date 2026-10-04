"use client";

import { useActionState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import {
  submitSupportRequest,
  type SupportResult,
} from "@/app/actions/support";
import { useT } from "@/components/i18n/locale-provider";

// The VALUE is what support receives (English, for the inbox); only the label is translated.
const TOPICS = [
  ["Billing", "contactForm.topicBilling"],
  ["Account", "contactForm.topicAccount"],
  // i18n-ignore: topic VALUES are what the support inbox receives (English); labels are translated
  ["Using the product", "contactForm.topicProduct"],
  ["Privacy & data", "contactForm.topicPrivacy"],
  ["Other", "contactForm.topicOther"],
] as const;

export function ContactForm() {
  const { t } = useT();
  const [state, action, pending] = useActionState<SupportResult | null, FormData>(
    submitSupportRequest,
    null,
  );

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-success/25 bg-success/[0.04] p-6 text-center">
        <CheckCircle2 className="mx-auto size-7 text-success" />
        <p className="mt-3 font-medium text-white">{t("contactForm.sentTitle")}</p>
        <p className="mt-1 text-sm text-white/55">
          {t("contactForm.sentBody")}
        </p>
      </div>
    );
  }

  const field =
    "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-champagne-400/40";

  return (
    <form action={action} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-xs text-white/50 mb-1.5">
            {t("contactForm.name")}
          </label>
          <input id="name" name="name" required maxLength={120} className={field} />
        </div>
        <div>
          <label htmlFor="email" className="block text-xs text-white/50 mb-1.5">
            {t("contactForm.email")}
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
          {t("contactForm.topic")}
        </label>
        <select id="topic" name="topic" className={field} defaultValue="">
          <option value="" disabled>
            {t("contactForm.chooseTopic")}
          </option>
          {TOPICS.map(([value, labelKey]) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-xs text-white/50 mb-1.5">
          {t("contactForm.message")}
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
        className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-5 py-3 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 transition-colors disabled:opacity-50"
      >
        <Send className="size-4" />
        {pending ? t("contactForm.sending") : t("contactForm.send")}
      </button>
    </form>
  );
}
