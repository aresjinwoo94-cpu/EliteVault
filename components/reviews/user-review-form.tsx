"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, CheckCircle2, Trash2, Upload, X } from "lucide-react";
import {
  submitUserReview,
  deleteMyReview,
  uploadMyReviewPhoto,
  removeMyReviewPhoto,
} from "@/app/actions/reviews";
import type { MyReview, ReviewPhoto } from "@/lib/reviews/types";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

/** On-the-fly resized render URL for a stored public photo (light previews). */
function reviewThumb(url: string, width = 160): string {
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  return `${url.replace(marker, "/storage/v1/render/image/public/")}?width=${width}&quality=60`;
}

const MIN = 20;
const MAX = 500;

/**
 * Authenticated review form. One review per account: if the user already has
 * one, this edits it in place (and shows its moderation status). Body length
 * is enforced 20–500 both here and on the server; the consent checkbox is
 * required to publish.
 */
export function UserReviewForm({
  defaultName,
  existing,
  allowPhotos = false,
  maxPhotos = 4,
}: {
  defaultName: string;
  existing: MyReview | null;
  allowPhotos?: boolean;
  maxPhotos?: number;
}) {
  const { t } = useT();
  const router = useRouter();
  const isEdit = !!existing;

  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState(existing?.display_name || defaultName || "");
  const [storeName, setStoreName] = useState(existing?.store_name ?? "");
  const [storeUrl, setStoreUrl] = useState(existing?.store_url ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [consent, setConsent] = useState(isEdit); // editing implies prior consent
  const [done, setDone] = useState<null | "pending" | "live" | "deleted">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const len = body.trim().length;
  const lenOk = len >= MIN && len <= MAX;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError(t("reviews.consent"));
      return;
    }
    startTransition(async () => {
      const res = await submitUserReview({
        rating,
        body,
        display_name: name,
        store_name: storeName || undefined,
        store_url: storeUrl || undefined,
        consent_public: true,
      });
      if (res.ok) {
        setDone(res.pending ? "pending" : "live");
        router.refresh();
      } else {
        setError(res.error || t("reviews.error"));
      }
    });
  }

  function remove() {
    if (!confirm(t("reviews.deleteConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteMyReview();
      if (res.ok) {
        setDone("deleted");
        router.refresh();
      } else {
        setError(res.error || t("reviews.error"));
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-success/25 bg-success/[0.04] p-6 text-center">
        <CheckCircle2 className="mx-auto size-7 text-success" />
        <p className="mt-3 text-sm leading-relaxed text-white/75">
          {done === "deleted"
            ? t("reviews.deleted")
            : done === "pending"
              ? t("reviews.successPending")
              : t("reviews.successLive")}
        </p>
      </div>
    );
  }

  const active = hover || rating;
  const statusLabel = existing
    ? {
        pending: t("reviews.statusPending"),
        approved: t("reviews.statusApproved"),
        hidden: t("reviews.statusHidden"),
        rejected: t("reviews.statusRejected"),
      }[existing.status]
    : null;

  return (
    <form
      onSubmit={submit}
      className="glow-card rounded-2xl border border-white/[0.06] bg-card p-6 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-xl tracking-tight">
          {isEdit ? t("reviews.editHeading") : t("reviews.writeHeading")}
        </h3>
        {statusLabel && (
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider",
              existing!.status === "approved"
                ? "border-success/30 bg-success/[0.08] text-success"
                : existing!.status === "pending"
                  ? "border-warning/30 bg-warning/[0.08] text-warning"
                  : "border-white/15 bg-white/[0.04] text-white/45",
            )}
          >
            {statusLabel}
          </span>
        )}
      </div>
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
              className="rounded p-0.5"
            >
              <Star
                className={cn(
                  "size-6 transition-colors",
                  n <= active
                    ? "fill-signal-400 text-signal-400"
                    : "text-white/20",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Body with mono counter */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase tracking-wider text-white/40">
            {t("reviews.body")}
          </label>
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              lenOk ? "text-white/40" : "text-white/30",
            )}
          >
            {len}/{MAX}
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("reviews.bodyPlaceholder")}
          required
          rows={4}
          maxLength={MAX}
          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-signal-400/40 focus:outline-none"
        />
        <p className="mt-1 font-mono text-[10px] text-white/30">{t("reviews.bodyMin")}</p>
      </div>

      {/* Name + store */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t("reviews.name")} value={name} onChange={setName} placeholder={t("reviews.namePlaceholder")} required />
        <Field label={t("reviews.storeName")} value={storeName} onChange={setStoreName} placeholder={t("reviews.storeNamePlaceholder")} />
      </div>
      <div className="mt-3">
        <Field label={t("reviews.storeUrl")} value={storeUrl} onChange={setStoreUrl} placeholder={t("reviews.storeUrlPlaceholder")} />
      </div>

      {/* Photos — only when the owner enabled them (Part 2 switch) */}
      {allowPhotos && (
        <div className="mt-5">
          <label className="text-xs uppercase tracking-wider text-white/40">
            {t("reviews.photosLabel")}
          </label>
          {existing ? (
            <MyReviewPhotos photos={existing.photos} maxPhotos={maxPhotos} />
          ) : (
            <p className="mt-1.5 text-xs text-white/40">
              {t("reviews.photoSaveFirst")}
            </p>
          )}
        </div>
      )}

      {/* Consent — required to publish */}
      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-white/[0.03] accent-signal-500"
        />
        <span className="text-xs leading-relaxed text-white/55">{t("reviews.consent")}</span>
      </label>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !lenOk || !consent}
          className="glow-cta inline-flex items-center justify-center gap-2 rounded-lg bg-champagne-400 px-5 py-2.5 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 disabled:opacity-50"
        >
          {pending
            ? t("reviews.submitting")
            : isEdit
              ? t("reviews.update")
              : t("reviews.submit")}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="glow-secondary inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3.5 py-2.5 text-sm text-white/60 hover:text-white disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            {t("reviews.delete")}
          </button>
        )}
      </div>
    </form>
  );
}

/** Self-service photo strip for the user's own review. Adding a photo re-enters
 *  moderation server-side; removing one does not. */
function MyReviewPhotos({
  photos,
  maxPhotos,
}: {
  photos: ReviewPhoto[];
  maxPhotos: number;
}) {
  const { t } = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const atMax = photos.length >= maxPhotos;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadMyReviewPhoto(fd);
      if (res.ok) router.refresh();
      else setError(res.error || t("reviews.error"));
    });
    e.target.value = "";
  }

  function remove(path: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeMyReviewPhoto(path);
      if (res.ok) router.refresh();
      else setError(res.error || t("reviews.error"));
    });
  }

  return (
    <>
      <p className="mt-1.5 text-xs text-white/35">
        {t("reviews.photosHint").replace("{count}", String(maxPhotos))}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {photos.map((p) => (
          <div
            key={p.path}
            className="relative size-16 overflow-hidden rounded-lg border border-white/[0.06] bg-black/30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reviewThumb(p.url)} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p.path)}
              disabled={pending}
              aria-label={t("reviews.photoRemove")}
              className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-md bg-black/70 text-white/80 hover:text-white disabled:opacity-50"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {maxPhotos > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending || atMax}
            className="glow-secondary inline-flex h-16 items-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] px-3 text-xs text-white/60 hover:text-white disabled:opacity-40"
          >
            <Upload className="size-3.5" />
            {pending ? t("reviews.photoUploading") : t("reviews.addPhoto")}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-white/40">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={200}
        className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-signal-400/40 focus:outline-none"
      />
    </div>
  );
}
