"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Star,
  Check,
  EyeOff,
  Trash2,
  Sparkles,
  RotateCcw,
  Mail,
  AlertTriangle,
} from "lucide-react";
import {
  updateReviewSettings,
  setReviewStatus,
  setReviewFeatured,
  deleteReview,
} from "@/app/actions/reviews";
import type { AdminReview, ReviewSettings } from "@/lib/reviews/types";
import { cn } from "@/lib/utils";

export function OwnerReviews({
  initialSettings,
  initialReviews,
  tablesReady,
}: {
  initialSettings: ReviewSettings;
  initialReviews: AdminReview[];
  tablesReady: boolean;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingCount = initialReviews.filter((r) => r.status === "pending").length;
  const approvedCount = initialReviews.filter((r) => r.status === "approved").length;

  function patch(p: Partial<ReviewSettings>) {
    setSettings((s) => ({ ...s, ...p })); // optimistic
    startTransition(async () => {
      await updateReviewSettings(p);
      router.refresh();
    });
  }

  function moderate(fn: () => Promise<unknown>, id: string) {
    setBusyId(id);
    startTransition(async () => {
      await fn();
      router.refresh();
      setBusyId(null);
    });
  }

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-card/40 p-5 md:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl tracking-tight text-white">
            Reseñas
          </h2>
          <p className="mt-1 text-sm text-white/45">
            Controla por completo lo que se ve en la página pública.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-white/55">
            {approvedCount} públicas
          </span>
          {pendingCount > 0 && (
            <span className="rounded-full border border-warning/30 bg-warning/[0.08] px-2.5 py-1 text-warning">
              {pendingCount} por aprobar
            </span>
          )}
        </div>
      </header>

      {!tablesReady && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.06] p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Las tablas de reseñas aún no existen. Aplica la migración{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">
              supabase/migrations/0016_reviews.sql
            </code>{" "}
            en tu proyecto de Supabase para activarlas. Mientras tanto, la
            sección pública permanece oculta (nada se rompe).
          </span>
        </div>
      )}

      {/* ── Master + visibility switches ─────────────────────────────────── */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Toggle
          label="Mostrar la sección de reseñas"
          help="Apágalo y desaparece TODO en la web: título, lista y formulario."
          checked={settings.enabled}
          onChange={(v) => patch({ enabled: v })}
          disabled={pending}
          master
        />
        <Toggle
          label="Mostrar la lista de reseñas"
          help="Las reseñas aprobadas visibles para el público."
          checked={settings.show_list}
          onChange={(v) => patch({ show_list: v })}
          disabled={pending || !settings.enabled}
        />
        <Toggle
          label="Mostrar el formulario"
          help="Deja que cualquiera escriba una reseña."
          checked={settings.show_form}
          onChange={(v) => patch({ show_form: v })}
          disabled={pending || !settings.enabled}
        />
        <Toggle
          label="Aprobar automáticamente"
          help="Si está activo, las nuevas reseñas se publican sin tu revisión."
          checked={settings.auto_approve}
          onChange={(v) => patch({ auto_approve: v })}
          disabled={pending || !settings.enabled}
        />
      </div>

      {/* ── Numeric controls ─────────────────────────────────────────────── */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stepper
          label="Cuántas mostrar"
          value={settings.display_count}
          min={0}
          max={60}
          onChange={(v) => patch({ display_count: v })}
          disabled={pending || !settings.enabled}
        />
        <Stepper
          label="Puntuación mínima visible"
          value={settings.min_rating}
          min={1}
          max={5}
          suffix="★"
          onChange={(v) => patch({ min_rating: v })}
          disabled={pending || !settings.enabled}
        />
      </div>

      {/* ── Moderation list ──────────────────────────────────────────────── */}
      <h3 className="mt-7 text-sm font-medium text-white/70">
        Todas las reseñas ({initialReviews.length})
      </h3>
      {initialReviews.length === 0 ? (
        <p className="mt-3 rounded-xl border border-white/[0.05] bg-black/20 p-5 text-center text-sm text-white/40">
          Aún no hay reseñas. Aparecerán aquí en cuanto alguien envíe una.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {initialReviews.map((r) => (
            <ReviewRow
              key={r.id}
              review={r}
              busy={busyId === r.id && pending}
              onApprove={() =>
                moderate(() => setReviewStatus(r.id, "approved"), r.id)
              }
              onHide={() => moderate(() => setReviewStatus(r.id, "hidden"), r.id)}
              onPending={() =>
                moderate(() => setReviewStatus(r.id, "pending"), r.id)
              }
              onFeature={() =>
                moderate(() => setReviewFeatured(r.id, !r.featured), r.id)
              }
              onDelete={() => {
                if (
                  confirm(
                    "¿Eliminar esta reseña para siempre? No se puede deshacer.",
                  )
                )
                  moderate(() => deleteReview(r.id), r.id);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewRow({
  review,
  busy,
  onApprove,
  onHide,
  onPending,
  onFeature,
  onDelete,
}: {
  review: AdminReview;
  busy: boolean;
  onApprove: () => void;
  onHide: () => void;
  onPending: () => void;
  onFeature: () => void;
  onDelete: () => void;
}) {
  const statusMeta = {
    approved: { label: "Pública", cls: "border-success/30 bg-success/[0.08] text-success" },
    pending: { label: "Por aprobar", cls: "border-warning/30 bg-warning/[0.08] text-warning" },
    hidden: { label: "Oculta", cls: "border-white/15 bg-white/[0.04] text-white/45" },
  }[review.status];

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.06] bg-black/20 p-4 transition-opacity",
        busy && "opacity-50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={
                n <= review.rating
                  ? "size-3.5 fill-champagne-400 text-champagne-400"
                  : "size-3.5 text-white/15"
              }
            />
          ))}
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", statusMeta.cls)}>
          {statusMeta.label}
        </span>
        {review.featured && (
          <span className="inline-flex items-center gap-1 rounded-full border border-champagne-400/30 bg-champagne-400/[0.08] px-2 py-0.5 text-[11px] text-champagne-300">
            <Sparkles className="size-3" /> Destacada
          </span>
        )}
        <span className="ml-auto text-[11px] text-white/35">
          {review.created_at ? new Date(review.created_at).toLocaleDateString() : ""}
        </span>
      </div>

      {review.title && (
        <p className="mt-2 text-sm font-medium text-white">{review.title}</p>
      )}
      <p className="mt-1 text-sm text-white/60 leading-relaxed">{review.body}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/40">
        <span>— {review.author_name}</span>
        {review.author_email && (
          <a
            href={`mailto:${review.author_email}`}
            className="inline-flex items-center gap-1 text-signal-300 hover:text-signal-200"
          >
            <Mail className="size-3" />
            {review.author_email}
          </a>
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {review.status !== "approved" && (
          <Action onClick={onApprove} icon={Check} className="text-success">
            Aprobar
          </Action>
        )}
        {review.status !== "hidden" && (
          <Action onClick={onHide} icon={EyeOff}>
            Ocultar
          </Action>
        )}
        {review.status !== "pending" && (
          <Action onClick={onPending} icon={RotateCcw}>
            A pendiente
          </Action>
        )}
        <Action
          onClick={onFeature}
          icon={Sparkles}
          className={review.featured ? "text-champagne-300" : ""}
        >
          {review.featured ? "Quitar destaque" : "Destacar"}
        </Action>
        <Action onClick={onDelete} icon={Trash2} className="text-destructive">
          Eliminar
        </Action>
      </div>
    </div>
  );
}

function Action({
  onClick,
  icon: Icon,
  className,
  children,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
  disabled,
  master,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  master?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors disabled:opacity-50",
        checked
          ? master
            ? "border-success/30 bg-success/[0.05]"
            : "border-signal-500/30 bg-signal-600/[0.05]"
          : "border-white/[0.06] bg-black/20",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
          checked ? (master ? "bg-success" : "bg-signal-500") : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-0.5 block text-xs text-white/45">{help}</span>
      </span>
    </button>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
      <p className="text-sm font-medium text-white">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - 1))}
          className="size-8 rounded-lg border border-white/[0.08] text-white/70 hover:border-white/20 disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-[3ch] text-center font-mono text-lg tabular-nums text-white">
          {value}
          {suffix ? <span className="ml-0.5 text-champagne-400">{suffix}</span> : null}
        </span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + 1))}
          className="size-8 rounded-lg border border-white/[0.08] text-white/70 hover:border-white/20 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
