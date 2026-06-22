"use client";

import { useState, useTransition } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { submitReview } from "@/app/actions/reviews";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function ReviewForm() {
  const { t } = useT();
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [done, setDone] = useState<null | "pending" | "live">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitReview({
        author_name: name,
        rating,
        title: title || undefined,
        body,
        author_email: email || undefined,
        company,
      });
      if (res.ok) {
        setDone(res.pending ? "pending" : "live");
      } else {
        setError(res.error || t("reviews.error"));
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-success/25 bg-success/[0.04] p-6 text-center">
        <CheckCircle2 className="mx-auto size-7 text-success" />
        <p className="mt-3 text-sm text-white/75 leading-relaxed">
          {done === "pending"
            ? t("reviews.successPending")
            : t("reviews.successLive")}
        </p>
      </div>
    );
  }

  const active = hover || rating;

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-white/[0.06] bg-card p-6 shadow-card"
    >
      <h3 className="font-serif text-xl tracking-tight">
        {t("reviews.writeHeading")}
      </h3>
      <p className="mt-1 text-sm text-white/45">{t("reviews.writeSubheading")}</p>

      {/* Rating */}
      <div className="mt-5">
        <label className="text-xs uppercase tracking-wider text-white/40">
          {t("reviews.rating")}
        </label>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${n}/5`}
              className="p-0.5"
            >
              <Star
                className={cn(
                  "size-6 transition-colors",
                  n <= active
                    ? "fill-champagne-400 text-champagne-400"
                    : "text-white/20",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label={t("reviews.name")}
          value={name}
          onChange={setName}
          placeholder={t("reviews.namePlaceholder")}
          required
        />
        <Field
          label={t("reviews.email")}
          value={email}
          onChange={setEmail}
          placeholder={t("reviews.emailPlaceholder")}
          type="email"
        />
      </div>

      <div className="mt-3">
        <Field
          label={t("reviews.title")}
          value={title}
          onChange={setTitle}
          placeholder={t("reviews.titlePlaceholder")}
        />
      </div>

      <div className="mt-3">
        <label className="text-xs uppercase tracking-wider text-white/40">
          {t("reviews.body")}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("reviews.bodyPlaceholder")}
          required
          rows={4}
          maxLength={1000}
          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
        />
      </div>

      {/* Honeypot — visually hidden, off-screen; bots fill it, humans don't. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
        aria-hidden="true"
      />

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-champagne-400 px-5 py-2.5 text-sm font-medium text-obsidian-950 transition-colors hover:bg-champagne-300 disabled:opacity-60"
      >
        {pending ? t("reviews.submitting") : t("reviews.submit")}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-white/40">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={160}
        className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
      />
    </div>
  );
}
